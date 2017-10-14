// ------------------------------------------------------------------------------
// Helper functions

function ajaxPostJson(url, data, success, error) {
    // http://api.jquery.com/jquery.ajax/

    if (!error) {
        error = (jqXHR, textStatus, errorThrown) => {
            console.log(textStatus);
        };
    }

    $.ajax({
        url: url,
        type: 'POST',
        data: (data === null && data === undefined) ? "" : JSON.stringify(data),
        contentType: 'application/json; charset=utf-8',
        dataType: 'json',
        async: true,
        success: success,      // Anything data, String textStatus, jqXHR jqXHR
        error: error           // jqXHR jqXHR, String textStatus, String errorThrown
    });
}

function ajaxPostJsonP(url, data) {
    return new Promise((resolve, reject) => {
        ajaxPostJson(url, data, resolve, reject);
    });
}

// ------------------------------------------------------------------------------
// UI functions

$(document).ready(function () {
    $('.masthead').visibility({
        once: false,
        onBottomPassed: function () {
            $('.fixed.menu').transition('fade in');
        },
        onBottomPassedReverse: function () {
            $('.fixed.menu').transition('fade out');
        }
    });
});

function showWelcomeScreen() {
    $("#loginButton").hide();
    $("#logoutButton").show();
    $("#signupButton").hide();

    $("#infoText_notLoggedIn").hide();
    $("#infoText_loggedIn").empty().html("Welcome " + localStorage.getItem("firstName") + " " + localStorage.getItem("lastName") + "!").show();
}

function showLoginScreen() {
    $("#loginButton").show();
    $("#logoutButton").hide();
    $("#signupButton").show();

    $("#infoText_loggedIn").hide();
    $("#infoText_notLoggedIn").show();
}

// ------------------------------------------------------------------------------
// Handlers for Signin/Login/Logout buttons

/*
Upon successful execution of create() or get(), the Relying Party's script receives a PublicKeyCredential containing an
AuthenticatorAttestationResponse or AuthenticatorAssertionResponse structure, respectively, from the client.
It must then deliver the contents of this structure to the Relying Party server, using methods outside the scope of this specification.
This section describes the operations that the Relying Party must perform upon receipt of these structures.

dictionary PublicKeyCredentialRequestOptions {                              // input to get()
    required BufferSource                challenge;
    unsigned long                        timeout;
    USVString                            rpId;
    sequence<PublicKeyCredentialDescriptor> allowCredentials = [];
    AuthenticationExtensions             extensions;
};

partial dictionary CredentialCreationOptions {                              // input to create()
    MakePublicKeyCredentialOptions      publicKey;
};

dictionary MakePublicKeyCredentialOptions {                                 
    required PublicKeyCredentialEntity           rp;
    required PublicKeyCredentialUserEntity       user;

    required BufferSource                             challenge;
    required sequence<PublicKeyCredentialParameters>  pubKeyCredParams;

    unsigned long                                timeout;
    sequence<PublicKeyCredentialDescriptor>      excludeCredentials = [];
    AuthenticatorSelectionCriteria               authenticatorSelection;
    AuthenticationExtensions                     extensions;
};

interface Credential {
  USVString id;
  DOMString type;
};

interface PublicKeyCredential : Credential {                                // output from create() and get()
    ArrayBuffer              rawId;
    AuthenticatorResponse    response;
    AuthenticationExtensions clientExtensionResults;
};

interface AuthenticatorResponse {
    ArrayBuffer      clientDataJSON; // This attribute contains a JSON serialization of the client data passed to the authenticator by the client in its call to either create() or get().
};

interface AuthenticatorAttestationResponse : AuthenticatorResponse {        // output from create() (response attribute)
    ArrayBuffer      attestationObject;
};

interface AuthenticatorAssertionResponse : AuthenticatorResponse {          // output from get() (response attribute)
    ArrayBuffer      authenticatorData;
    ArrayBuffer      signature;
};

*/

function onLoginButton() {
    // Follows this example from the spec: https://www.w3.org/TR/webauthn/#sample-authentication
    
    ajaxPostJson("/api/login_begin", { }, loginBeginResult => {
        var options = {
            rpId: "webauth-prototype.org",      // This name should be read from document.domain, but we hardcode for this prototype
            challenge: loginBeginResult.login_challenge,
            timeout: 60000,  // 1 minute
            allowCredentials: [{ type: "public-key" }]
        };

        navigator.credentials.get({ "publicKey": options })
            .then(function (credentials) {
                if (credentials) {

                    // https://github.com/w3c/webauthn/issues/587
                    // Noget om at user.id mangler! Jeg bruger så publicKey ... 

                    ajaxPostJson("/api/login_end", {
                        sessionId: loginBeginResult.sessionId,
                        publicKey: credentials.rawId,
                        authenticatorData: credentials.response.authenticatorData,
                        signature: credentials.response.signature
                    }, loginEndResult => {
                        if (loginEndResult.success) {
                            localStorage.setItem("sessionId", loginBeginResult.sessionId);
                            localStorage.setItem("accountId", loginEndResult.accountId);
                            localStorage.setItem("firstName", loginEndResult.firstName);
                            localStorage.setItem("lastName", loginEndResult.lastName);
                            showWelcomeScreen();
                        } else {
                            window.alert("Login failed: " + loginEndResult.message);
                        }
                    });
                }
            });
    });
}

function onLogoutButton() {
    let sessionId = localStorage.getItem("sessionId");
    if (sessionId) {
        localStorage.setItem("sessionId", null);
        localStorage.setItem("accountId", null);
        localStorage.setItem("firstName", null);
        localStorage.setItem("lastName", null);
        showLoginScreen();
        ajaxPostJson("/api/logout", { sessionId: sessionId }, rv => { });
    }
}

function modal_accountInfo_show() {
    return new Promise((resolve, reject) => {
        let firstNameInput = $("#modal_accountInfo_firstName");
        let lastNameInput = $("#modal_accountInfo_lastName");

        firstNameInput.val("John");
        lastNameInput.val("Doe");

        let aborted = true;
        let modal = $("#modal_accountInfo").modal({
            onHide: function () {
                if (aborted) resolve(null);
            },
            onShow: function () {
            },
        }).modal("show");

        $("#modal_accountInfo_cancelButton").unbind("click").click(function (event) {
            modal.modal("hide");
        });

        $("#modal_accountInfo_createButton").unbind("click").click(function (event) {
            aborted = false;
            resolve({ firstName: firstNameInput.val(), lastName: lastNameInput.val() });
            modal.modal("hide");
        });

    });
}

// Follows this example from the spec: https://www.w3.org/TR/webauthn/#sample-registration
function onSignupButton() {
    modal_accountInfo_show().then(accountInfo => {
        if (accountInfo) {
            ajaxPostJson("/api/register_begin", { firstName: accountInfo.firstName, lastName: accountInfo.lastName }, registerInfo => {
                let userFullName = accountInfo.firstName + " " + accountInfo.lastName;

                // Se her: https://www.w3.org/TR/webauthn/#dictionary-makecredentialoptions
                //         https://w3c.github.io/webappsec-credential-management/#dom-credential-create-slot

                var publicKeyOptions = {

                    // This member contains a challenge intended to be used for generating the newly created credential’s attestation object.
                    challenge: registerInfo.register_challenge,

                    // Relying Party
                    rp: { name: "webauth-prototype.org" },      // This name should be read from document.domain, but we hardcode for this prototype

                    // https://www.w3.org/TR/webauthn/#dictionary-pkcredentialentity
                    user: {
                        id: registerInfo.accountId,                                         // For a user account entity, this will be an arbitrary string specified by the relying party.
                        name: accountInfo.firstName + " " + accountInfo.lastName,           // A human-friendly identifier for the entity.
                        displayName: accountInfo.firstName + " " + accountInfo.lastName,    // A friendly name for the user account
                        icon: null
                    },

                    // https://www.w3.org/TR/webauthn/#sctn-cose-alg-reg
                    pubKeyCredParams: [
                        {
                            type: "public-key",
                            alg: -257    // RSASSA-PKCS1-v1_5 w/ SHA-256
                        }
                    ],

                    timeout: 60000,            // 1 minute
                    excludeCredentials: []     // No exclude list of PKCredDescriptors
                };

                // The following call will cause the authenticator to display UI.
                navigator.credentials.create({ "publicKey": publicKeyOptions }).then(function (credentials) {
                    if (credentials) {
                        // Send new credential info to server for verification and registration.
                        ajaxPostJson("/api/register_end", {
                            accountId: registerInfo.accountId,
                            attestationObject: credentials.response.attestationObject
                        }, rv => {
                            if (rv.success) {
                                localStorage.setItem("sessionId", rv.sessionId);
                                localStorage.setItem("accountId", registerInfo.accountId);
                                localStorage.setItem("firstName", accountInfo.firstName);
                                localStorage.setItem("lastName", accountInfo.lastName);
                                showWelcomeScreen();
                            } else {
                                window.alert("Registration failed: " + rv.message);
                            }
                        });
                    }
                });
            });
        }
    });
}
