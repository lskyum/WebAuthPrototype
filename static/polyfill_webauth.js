class Authenticator {
    constructor() {
        this._credentials = [];
    }

    // Generate a keypair and save it in the authenticator. Only return the public key.
    _makeCredential(rpId, clientDataHash, relyingPartyCreds, userAccountCreds, pubKeyCredParams) {
        return new Promise((resolve, reject) => {
            $.blockUI({ message: "Generating key..." });
            ajaxPostJson("/api/client_crypto/generate_rsa_key", {}, rsaKeyPair => {
                $.unblockUI();

                let credentials = {
                    rpId: rpId,
                    clientDataHash: clientDataHash,
                    relyingPartyCreds: relyingPartyCreds,
                    userAccountCreds: userAccountCreds,
                    publicKey: rsaKeyPair.publicKey,
                    privateKey: rsaKeyPair.privateKey
                };
                this._credentials.push(credentials);

                resolve({
                    publicKey: credentials.publicKey,     // It is important that privateKey never leaves the authenticator
                    authenticatorData: this._authenticatorData,                    
                    attestationCertificate: "<<attestationCertificate>>",
                    attestationSignature: "<<attestationSignature>>"
                });

                // TODO: https://www.w3.org/TR/webauthn/#packed-attestation
                //       Se under Signing procedure
                //       Se også https://www.w3.org/TR/webauthn/#generating-an-attestation-object
                //               https://www.w3.org/TR/webauthn/#sec-attestation-security-considerations
            });
        });
    }

    _getAssertion(credentials) {
        return new Promise((resolve, reject) => {

            // The signature is over the concatination of clientDataHash and authenticatorData (https://www.w3.org/TR/2017/WD-webauthn-20170811/#op-get-assertion)
            // We use string concatination here, but it may be binary concatination in the protocol. It is somewhat unclear in the spec.
            let challenge = credentials.clientDataHash + this._authenticatorData;

            ajaxPostJson("/api/client_crypto/sign_challenge", { privateKey: credentials.privateKey, challenge: challenge }, rv => {
                resolve({
                    publicKey: credentials.publicKey,     // It is important that privateKey never leaves the authenticator
                    authenticatorData: this._authenticatorData,
                    signature: rv.signature
                });
            });
        });
    }

    // https://www.w3.org/TR/2017/WD-webauthn-20170811/#op-make-cred
    authenticatorMakeCredential(rpId, clientDataHash, relyingPartyCreds, userAccountCreds) {
    }

    // https://www.w3.org/TR/2017/WD-webauthn-20170811/#op-get-assertion
    authenticatorGetAssertion(rpId, clientDataHash, acceptableCredentials, extensionData) {
    }

    // https://www.w3.org/TR/2017/WD-webauthn-20170811/#op-cancel
    authenticatorCancel(){
    }
}

class PhoneAuthenticator extends Authenticator {
    constructor() {
        super();
        this._authenticatorData = JSON.stringify({
            type: "Phone"
        });
    }

    // https://www.w3.org/TR/2017/WD-webauthn-20170811/#op-make-cred
    authenticatorMakeCredential(rpId, clientDataHash, relyingPartyCreds, userAccountCreds, pubKeyCredParams) {
        return new Promise((resolve, reject) => {
            let algo = pubKeyCredParams.find(a => a.type == "public-key" && a.alg == -257);     // The only supported algorithm in this prototype
            if (algo) {
                polyfill_ui_makeCredential_phone(userAccountCreds.name).then(rv => {   // Prompt the user for acceptance (and biometric)
                    if (rv.accept) {
                        super._makeCredential(rpId, clientDataHash, relyingPartyCreds, userAccountCreds, pubKeyCredParams).then(creds => {     // Create new credentials inside the Authenticator
                            resolve(creds);
                        });
                    } else {
                        resolve(null);
                    }
                });
            } else {
                reject("NotSupportedError: No supported algorithm found.");
            }
        });
    }

    // https://www.w3.org/TR/2017/WD-webauthn-20170811/#op-get-assertion
    authenticatorGetAssertion(rpId, clientDataHash, acceptableCredentials, extensionData) {
        // Input
        // - The caller’s RP ID, as determined by the user agent and the client.
        // - The hash of the serialized client data, provided by the client.
        // - A list of credentials acceptable to the Relying Party (possibly filtered by the client), if any.
        // - Extension data created by the client based on the extensions requested by the Relying Party, if any.
        //
        // Output
        // - The identifier of the credential (credential ID) used to generate the assertion signature.
        // - The authenticator data used to generate the assertion signature.
        // - The assertion signature.

        return new Promise((resolve, reject) => {
            let credentials = this._credentials;
            // TODO: clone and filter list by rpId and acceptableCredentials
            // TODO: handle if list is empty (If the previous step resulted in an empty list, return an error code equivalent to "NotAllowedError" and terminate the operation.)
            polyfill_ui_getCredentials_phone(credentials).then(creds => {
                if (creds) {
                    resolve(super._getAssertion(creds));
                } else {
                    resolve(null);
                }
            });
        });
    }

    // https://www.w3.org/TR/2017/WD-webauthn-20170811/#op-cancel
    authenticatorCancel() {
    }
}

class PlatformAuthenticator extends Authenticator {
    constructor() {
        super();
        this._authenticatorData = JSON.stringify({
            type: "Platform"
        });
    }

    // https://www.w3.org/TR/2017/WD-webauthn-20170811/#op-make-cred
    // NOTE: I cannot complety match the specification here. How is the challenge send to the Authenticator??
    authenticatorMakeCredential(rpId, clientDataHash, relyingPartyCreds, userAccountCreds, pubKeyCredParams) {
        return new Promise((resolve, reject) => {
            let algo = pubKeyCredParams.find(a => a.type == "public-key" && a.alg == -257);     // The only supported algorithm in this prototype
            if (algo) {
                polyfill_ui_makeCredential_platform(userAccountCreds.name).then(rv => {
                    if (rv.accept) {
                        super._makeCredential(rpId, clientDataHash, relyingPartyCreds, userAccountCreds, pubKeyCredParams).then(credentials => {
                            resolve(credentials);
                        });
                    } else {
                        resolve(null);
                    }                    
                });    
            } else {
                reject("NotSupportedError: No supported algorithm found.");
            }
        });
    }

    // https://www.w3.org/TR/2017/WD-webauthn-20170811/#op-get-assertion
    authenticatorGetAssertion(rpId, clientDataHash, acceptableCredentials, extensionData) {
        return new Promise((resolve, reject) => {
            let credentials = this._credentials;
            // TODO: clone and filter list by rpId and acceptableCredentials
            // TODO: handle if list is empty (If the previous step resulted in an empty list, return an error code equivalent to "NotAllowedError" and terminate the operation.)
            polyfill_ui_getCredentials_platform(credentials).then(creds => {
                if (creds) {
                    resolve(super._getAssertion(creds));
                } else {
                    resolve(null);
                }
            });
        });
    }

    // https://www.w3.org/TR/2017/WD-webauthn-20170811/#op-cancel
    authenticatorCancel() {
    }
}

var authenticator_phone = new PhoneAuthenticator();
var authenticator_platform = new PlatformAuthenticator();

// -----------------------------------------------------

navigator.credentials = {};

function authenticator_getById(authenticatorId) {
    if (authenticatorId == "Phone") {
        return authenticator_phone;
    } else if (authenticatorId == "Platform") {  // Trusted Platform Modules (TPM)
        return authenticator_platform;
    } else {
        throw new Error("Invalid authenticatorId");
    }
}

function sha256(str) {
    return new Promise((resolve, reject) => {
        ajaxPostJson("/api/client_crypto/sha256", { value: str }, rv => {
            resolve(rv.hash);
        });
    });
}

// options: PublicKeyCredentialRequestOptions
// returns: Promise<PublicKeyCredential> (where response is of type AuthenticatorAssertionResponse)
navigator.credentials.get = function (options) {

    // TODO: validate options (for example rpId)

    return new Promise((resolve, reject) => {

        // https://www.w3.org/TR/2017/WD-webauthn-20170811/#sec-client-data
        let clientData = {
            challenge: options.publicKey.challenge,
            origin: options.publicKey.rpId,
            hashAlgorithm: "SHA-256",
            tokenBindingId: null,
            clientExtensions: null,
            authenticatorExtensions: null
        };

        let clientDataJSON = JSON.stringify(clientData);
        sha256(clientDataJSON).then(clientDataHash => {
            // Simulate the user selecting an Authenticator via. UI interaction
            polyfill_ui_showAuthenticatorSelection().then((authenticatorId) => {
                if (authenticatorId) {
                    let authenticator = authenticator_getById(authenticatorId);

                    // Simulates the interaction between the Browser and an Authenticator
                    authenticator.authenticatorGetAssertion(options.publicKey.rpId, clientDataHash, options.allowCredentials, null).then(creds => {
                        if (creds) {
                            resolve({
                                rawId: creds.publicKey,
                                response: {
                                    clientDataJSON: clientDataJSON,
                                    authenticatorData: creds.authenticatorData,
                                    signature: creds.signature
                                },
                                clientExtensionResults: null
                            });
                        } else {
                            resolve(null);
                        }
                    });
                } else {
                    resolve(null);
                }
            });
        });
    });
};

// https://w3c.github.io/webappsec-credential-management/#abstract-opdef-create-a-credential
// options: CredentialCreationOptions
// returns: Promise<PublicKeyCredential> (where response is of type AuthenticatorAttestationResponse)
navigator.credentials.create = function (options) {

    // TODO: validate options (f.eks. rpId)


    return new Promise((resolve, reject) => {

        // Simulate the user selecting an Authenticator
        polyfill_ui_showAuthenticatorSelection().then(authenticatorId => {
            if (authenticatorId) {
                let authenticator = authenticator_getById(authenticatorId);

                // https://www.w3.org/TR/2017/WD-webauthn-20170811/#sec-client-data
                let clientData = {
                    challenge: options.publicKey.challenge,
                    origin: options.publicKey.rp.name,
                    hashAlgorithm: "SHA-256",
                    tokenBindingId: null,
                    clientExtensions: null,
                    authenticatorExtensions: null
                };
                
                // A raw cryptographic signature must assert the integrity of both the client data and the authenticator data. Thus, an authenticator shall compute a signature over the concatenation of the authenticatorData and the clientDataHash.
                // https://fidoalliance.org/specs/fido-v2.0-ps-20150904/fido-signature-format-v2.0-ps-20150904.html#authenticator-signature
                let clientDataJSON = JSON.stringify(clientData);
                sha256(clientDataJSON).then(clientDataHash => {
                    // Simulate communication between the Browser and the Authenticator (https://www.w3.org/TR/2017/WD-webauthn-20170811/#op-make-cred)
                    authenticator.authenticatorMakeCredential(options.publicKey.rp.name, clientDataHash, options.publicKey.rp, options.publicKey.user, options.publicKey.pubKeyCredParams).then(creds => {
                        if (creds) {
                            resolve({
                                rawId: creds.publicKey,
                                response: {
                                    clientDataJSON: clientDataJSON,
                                    attestationObject: {    // https://www.w3.org/TR/2017/WD-webauthn-20170811/#generating-an-attestation-object
                                        authData: {
                                            publicKey : creds.publicKey,
                                            authenticatorData: creds.authenticatorData
                                        },
                                        fmt: "json",
                                        attStmt: {
                                            alg: -257,    // RSASSA-PKCS1-v1_5 w/ SHA-256
                                            sig: creds.attestationSignature,
                                            x5c: creds.attestationCertificate
                                        }
                                    }
                                },
                                clientExtensionResults: null
                            });
                        } else {
                            resolve(null);
                        }
                    });
                });
            } else {
                resolve(null);
            }
        });
    });
};