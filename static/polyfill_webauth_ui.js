// ---------------------------------------------------------------------------
// Helpers

function polyfill_ui_showModal(elementId, hideEvent) {
    let aborted = true;
    let modal = $("#" + elementId).modal({
        onHide: function () {
            if (hideEvent) hideEvent();
        },
        onShow: function () {
        },
    }).modal("show");
    return modal;
}

// ---------------------------------------------------------------------------
// Authenticator Selection

function polyfill_ui_showAuthenticatorSelection() {
    return new Promise((resolve, reject) => {

        let itemSelected = false;
        let modal = $("#modal_selectAuthenticator").modal({
            onHide: function () {
                if (!itemSelected) resolve(null);
            },
            onShow: function () {
            },
        }).modal("show");

        $("#modal_selectAuthenticator_item1").unbind("click").click(function (event) {
            resolve("Platform");
            itemSelected = true;
            modal.modal("hide");
        });

        $("#modal_selectAuthenticator_item2").unbind("click").click(function (event) {
            resolve("Phone");
            itemSelected = true;
            modal.modal("hide");
        });
    });
}


// ---------------------------------------------------------------------------
// Phone Biometric

var polyfill_ui_phone_aqireBiometric_anim = null;

function polyfill_ui_phone_aqireBiometric_onHide() {
    if (polyfill_ui_phone_aqireBiometric_anim) {
        clearInterval(polyfill_ui_phone_aqireBiometric_anim);
        polyfill_ui_phone_aqireBiometric_anim = null;
    }
    $("#modal_phone_fingerprint").css("opacity", 0.0);
}

function polyfill_ui_phone_aqireBiometric() {
    return new Promise((resolve, reject) => {
        let fingerPrint = $("#modal_phone_fingerprint");
        
        let animOpacity = 0.0;
        let animFadeIn = true;
        polyfill_ui_phone_aqireBiometric_anim = setInterval(() => {
            if (animFadeIn) {
                animOpacity += 0.05;
                if (animOpacity >= 1.0) {
                    animOpacity = 1.0;
                    animFadeIn = false;
                }
            } else {
                animOpacity -= 0.05;
                if (animOpacity <= 0.0) {
                    animOpacity = 0.0;
                    animFadeIn = true;
                }
            }
            fingerPrint.css("opacity", animOpacity);
        },20);

        fingerPrint.unbind("click").click(function (event) {
            resolve("OK");
            polyfill_ui_phone_aqireBiometric_onHide();
        });
    });
}

// ---------------------------------------------------------------------------
// Platform PIN

function polyfill_ui_platform_aquirePin() {
    return new Promise((resolve, reject) => {
        let aborted = true;
        let modal = polyfill_ui_showModal("modal_pin", () => {
            if (aborted) resolve(false);
        });

        let pinInput = $("#modal_pin_pinInput");
        pinInput.val("");
        pinInput.unbind("input").on("input", () => {
            let pin = pinInput.val();
            if (pin.length === 4) {
                if (pin === "1234") {
                    aborted = false;
                    modal.modal("hide");
                    resolve(true);
                } else {
                    pinInput.val("");
                    window.alert("Invalid PIN - please try again");
                }
            }
        });

        $("#modal_pin_cancelButton").unbind("click").click((event) => {
            modal.modal("hide");
        });
    });
}

// ---------------------------------------------------------------------------
// Create Credentials

function polyfill_ui_makeCredential_phone() {
    return new Promise((resolve, reject) => {
        $("#phone_content_makeCredential").show();
        $("#phone_content_getCredentials").hide();
        
        let createButton = $("#phone_content_makeCredential_createButton");
        let fingerPrint = $("#modal_phone_fingerprint");

        fingerPrint.css("opacity", 0.0);
        createButton.removeClass("disabled");

        let aborted = true;
        let modal = $("#modal_phone").modal({
            onHide: function () {
                polyfill_ui_phone_aqireBiometric_onHide();
                if (aborted) resolve({ accept: false });
            },
            onShow: function () {
            },
        }).modal("show");

        $("#phone_content_makeCredential_cancelButton").unbind("click").click((event) => {
            modal.modal("hide");
        });

        createButton.unbind("click").click((event) => {
            createButton.unbind("click");
            createButton.addClass("disabled");
            polyfill_ui_phone_aqireBiometric().then(fp => {
                resolve({ accept : true });
                aborted = false;
                modal.modal("hide");
            });

        });
    });
}

function polyfill_ui_makeCredential_platform() {
    return new Promise((resolve, reject) => {
        let aborted = true;
        let modal = polyfill_ui_showModal("modal_platform_makeCredential", () => {
            if (aborted) resolve({ accept: false });
        });

        $("#modal_platform_makeCredential_cancelButton").unbind("click").click((event) => {
            modal.modal("hide");
        });

        $("#modal_platform_makeCredential_createButton").unbind("click").click((event) => {
            aborted = false;
            modal.modal("hide");

            //let name = credentialsName.val();
            polyfill_ui_platform_aquirePin().then(pinOk => {
                if (pinOk) {
                    resolve({ accept: true });
                } else {
                    resolve({ accept: false });
                }
                
            });            
        });
    });
}

// ---------------------------------------------------------------------------
// Get Credentials

function polyfill_ui_getCredentials_phone(credentials) {
    return new Promise((resolve, reject) => {
        $("#phone_content_makeCredential").hide();
        $("#phone_content_getCredentials").show();

        let list = $("#phone_content_getCredentials_list");
        let aborted = true;
        let modal = polyfill_ui_showModal("modal_phone", () => {
            if (aborted) resolve(null);
            polyfill_ui_phone_aqireBiometric_onHide();
        });

        list.empty();

        let itemsHtml = "";
        for (let c of credentials) {
            let item = $("<div class=\"item\"><img class=\"ui avatar image\" src=\"/images/phone_user.png\"><div class=\"content\"><div class=\"header\">" + c.userAccountCreds.displayName + "</div></div></div>");
            list.append(item);
            item.click(() => {
                polyfill_ui_phone_aqireBiometric().then(rv => {
                    aborted = false;
                    resolve(c);
                    modal.modal("hide");
                });                
            });
        }

        let rejectItem = $("<div class=\"item\"><img class=\"ui avatar image\" src=\"/images/phone_cancel.png\"><div class=\"content\"><div class=\"header\">Cancel</div></div></div>");
        rejectItem.click(() => {
            modal.modal("hide");
        });
        list.append(rejectItem);
    });
}

function polyfill_ui_getCredentials_platform(credentials) {
    return new Promise((resolve, reject) => {
        let list = $("#modal_platform_getCredentials_list");
        let aborted = true;
        let modal = polyfill_ui_showModal("modal_platform_getCredentials", () => {
            if (aborted) resolve(null);
        });

        list.empty();

        let itemsHtml = "";
        for (let c of credentials) {
            let item = $("<div class=\"item\"><img class=\"ui avatar image\" src=\"/images/phone_user.png\"><div class=\"content\"><div class=\"header\">" + c.userAccountCreds.displayName + "</div></div></div>");
            list.append(item);
            item.click(() => {
                aborted = false;
                modal.modal("hide");
                polyfill_ui_platform_aquirePin().then(pinOk => {
                    if (pinOk) {
                        resolve(c);
                    } else {
                        resolve(null);
                    }                    
                });
            });
        }
    });
}
