// ------------------------------------------------------------------------------------
// Initialization

'use strict';
var port = process.env.PORT || 1337;

var express = require("express");
var bodyParser = require('body-parser')
var fs = require("fs");
var crypto = require("crypto");
var uuidv4 = require('uuid/v4');
var NodeRSA = require('node-rsa');

var app = express();
app.use(bodyParser.json());         // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
    extended: true
}));

app.use('/', express.static('static'));
app.use(function (err, req, res, next) {
    res.status(500);
    res.render('error', { error: err });
});

app.get("/", function (req, res) {
    res.sendFile(__dirname + "/res/Index.html");
});

// Initialize logging to console
app.use(function (req, res, next) {
    function truncateString(s, max) {
        if (max < 3) return "...";
        s = "" + s;
        if (s.length > max - 3) {
            return s.substring(0, max - 3) + "...";
        }
        return s;
    }
    if (req.body) {
        console.log("------------------------------------------------");
        console.log(req.path);
        for (let k in req.body) {
            console.log("   " + k + " : " + truncateString(JSON.stringify(req.body[k]), 40));
        }

        console.log("----");
        let old_end = res.end;
        res.end = function (value) {
            let obj;
            try { obj = JSON.parse(value);} catch (err){}
            if (obj) {
                for (let k in obj) {
                    console.log("   " + k + " : " + truncateString(JSON.stringify(obj[k]), 40));
                }
            } else {
                console.log(value);
            }
            old_end.apply(res, arguments);
        };
    }    
    next();
});

// ------------------------------------------------------------------------------------
// Data and Helper functions

var accounts = [];
var accountsByPublicKey = {};
var sessions = {};

function createSession() {
    let session = {
        sessionId: uuidv4(),       // Generate a random GUID to identify this session
        account: null,             // Not yet attached to an Account, because the user hasn't identified itself and logged in yet 
        loggedIn: false            // Not logged in yet...
    };
    sessions[session.sessionId] = session;
    return session;
}

function generateChallenge() {
    return crypto.randomBytes(32).toString('base64');
}

function sha256(str) {
    return crypto.createHash('sha256').update('alice', 'utf8').digest("base64");
}

// ------------------------------------------------------------------------------------
// Registration

app.post("/api/register_begin", function (req, res) {
    let account = {
        accountId: uuidv4(),   // Generate a random GUID for the AccountId
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        authenticators : [],
        register_challenge: generateChallenge()
    };
    
    accounts.push(account);
    
    res.end(JSON.stringify({
        accountId: account.accountId,
        register_challenge: account.register_challenge
    }));
});

function fakeX509verify(cert, data, sig) {
    return cert == "<<attestationCertificate>>" && sig == "<<attestationSignature>>";
}

app.post("/api/register_end", function (req, res) {
    let account = accounts.find(a => a.accountId === req.body.accountId);
    if (account) {
        let publicKey = req.body.attestationObject.authData.publicKey;
        let authenticatorData = req.body.attestationObject.authData.authenticatorData;

        // Here we could verify if the Authentication (authenticatorData) meets the requirements of the web application. (For example disallow specific vendors.)

        // https://www.w3.org/TR/2017/WD-webauthn-20170811/#sec-client-data
        let clientData = {
            challenge: account.register_challenge,
            origin: "webauth-prototype.org",        // This name should be the domain where the web application is hostet.
            hashAlgorithm: "SHA-256",
            tokenBindingId: null,
            clientExtensions: null,
            authenticatorExtensions: null
        };

        let clientDataJSON = JSON.stringify(clientData);
        let clientDataHash = sha256(clientDataJSON);

        // Here the server would validate the X.509 certificate and signature from the Authentication
        // The signature should be over a concatination of clientDataHash (which is generated over the challenge, among other things)
        // and attestationObject (which contains the generated publicKey)
        //
        // This did not make it into the prototype, so it is a fake implementation.
        let x509cert = req.body.attestationObject.attStmt.x5c;
        let x509sign = req.body.attestationObject.attStmt.sig;
        let x509data = clientDataHash + JSON.stringify(req.body.attestationObject);     // This would be a binary concatination in a real implementaiton
        if (fakeX509verify(x509cert, x509data, x509sign)) {
            account.authenticators.push({
                publicKey: publicKey,
                authenticatorData: authenticatorData
            });
            accountsByPublicKey[publicKey] = account;

            let session = createSession();
            session.loggedIn = true;        // Automatically log in when device is registered.

            res.end(JSON.stringify({ success: true, sessionId: session.sessionId }));
        } else {
            res.end(JSON.stringify({ success: false, message : "Attestation did not verify correctly" }));
        }
    } else {
        res.end(JSON.stringify({ success: false, message: "Invalid Account" }));
    }
});

// ------------------------------------------------------------------------------------
// Login

app.post("/api/login_begin", function (req, res) {
    let session = createSession();
    session.login_challenge = generateChallenge();

    res.end(JSON.stringify({
        sessionId: session.sessionId,
        login_challenge: session.login_challenge
    }));
});

app.post("/api/login_end", function (req, res) {
    let session = sessions[req.body.sessionId];

    if (!session) {
        res.end(JSON.stringify({ success: false, message: "Session not found." }));
        return;
    }

    let account = accountsByPublicKey[req.body.publicKey];
    if (!account) {
        res.end(JSON.stringify({ success: false, message: "Invalid Account" }));
        return;
    }

    if (session.loggedIn) {
        res.end(JSON.stringify({ success: false, message : "Already logged in" }));
        return;
    }

    let authenticator = account.authenticators.find(a => a.publicKey == req.body.publicKey);
    if (!authenticator) {
        res.end(JSON.stringify({ success: false, message: "Invalid Authenticator" }));
        return;
    }

    // https://www.w3.org/TR/2017/WD-webauthn-20170811/#sec-client-data
    let clientData = {
        challenge: session.login_challenge,
        origin: "webauth-prototype.org",        // This name should be the domain where the web application is hostet.
        hashAlgorithm: "SHA-256",
        tokenBindingId: null,           // Omittet in this prototype
        clientExtensions: null,         // Omittet in this prototype
        authenticatorExtensions: null   // Omittet in this prototype
    };

    let clientDataJSON = JSON.stringify(clientData);
    let clientDataHash = sha256(clientDataJSON);

    // The signature is over the concatination of clientDataHash and authenticatorData (https://www.w3.org/TR/2017/WD-webauthn-20170811/#op-get-assertion)
    // We use string concatination here, but it may be binary concatination in the protocol. It is somewhat unclear in the spec.
    let challenge = clientDataHash + req.body.authenticatorData;

    let key = new NodeRSA(authenticator.publicKey, "pkcs1-public-pem", { signingScheme: "pkcs1-sha256" });
    if (key.verify(challenge, req.body.signature, "base64", "base64")) {
        session.account = account;  // Attach the account to the session
        session.loggedIn = true;
        res.end(JSON.stringify({
            success: true,
            accountId: account.accountId,
            firstName: account.firstName,
            lastName: account.lastName
        }));
    } else {
        res.end(JSON.stringify({ success: false, message : "Invalid Attestation" }));
    }
});

// ------------------------------------------------------------------------------------
// Logout

app.post("/api/logout", function (req, res) {
    let session = sessions[req.body.sessionId];
    if (session) {
        delete sessions[req.body.sessionId];
        res.end(JSON.stringify({ success: true }));
    } else {
        res.end(JSON.stringify({ success: false }));
    }
});

//------------------------------------------------------------------------------------
// Cryptographic helper functions for the client
//    In a real life scenario theese functions would be implemented inside the 
//    authenticator devices, but in this prototype we cheat and let the server help.

app.post("/api/client_crypto/generate_rsa_key", function (req, res) {
    let key = new NodeRSA({ b: 2048 });
    res.end(JSON.stringify({
        publicKey : key.exportKey("pkcs1-public-pem"),
        privateKey: key.exportKey("pkcs1-private-pem")
    }));
});

app.post("/api/client_crypto/sign_challenge", function (req, res) {
    let key = new NodeRSA(req.body.privateKey, "pkcs1-private-pem", { signingScheme: "pkcs1-sha256" });
    let signature = key.sign(req.body.challenge, "base64", "base64");
    res.end(JSON.stringify({
        signature: signature
    }));
});

app.post("/api/client_crypto/sha256", function (req, res) {
    res.end(JSON.stringify({
        hash: sha256(req.body.value)
    }));
});

//------------------------------------------------------------------------------------

app.listen(port, function () {
    console.log("Listening on port " + port);
});


