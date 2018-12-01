var Client;
(function (Client) {
    var system = client.registerSystem(0, 0);
    var playerData = null;
    // Setup which events to listen for
    system.initialize = function () {
        // set up your listenToEvents and register client-side components here.
        // Setup callback for UI events from the custom screens
        system.listenForEvent("minecraft:ui_event" /* UIEvent */, onUIMessage);
        system.listenForEvent("minecraft:client_entered_world" /* ClientEnteredWorld */, onClientEnteredWorld);
        system.listenForEvent("minecraft:pick_hit_result_changed" /* PickHitResultChanged */, onPickHitResultChanged);
        system.listenForEvent("chess:notify_game_starting" /* GameStarting */, onGameStarting);
    };
    function onPickHitResultChanged(eventData) {
        //system.broadcastEvent(BroadcastableClientEvent.DisplayChat, `Pick hit changed: ${eventData.entity} @ ${JSON.stringify(eventData.position)}`);
    }
    function onClientEnteredWorld(eventData) {
        loadUI(UI.Lobby);
        playerData = eventData;
    }
    function onGameStarting(game) {
        if (!game.players.some(function (p) { return p.id === playerData.id; }))
            return;
        loadUI(UI.NewGame);
    }
    function onUIMessage(eventData) {
        switch (eventData) {
            case "chess:join_game":
                unloadUI(UI.Lobby);
                system.broadcastEvent("chess:join_new_game" /* JoinNewGame */, playerData);
                break;
            case "chess:close_ui":
                unloadUI(UI.Lobby);
                break;
        }
    }
    function loadUI(ui) {
        for (var _i = 0, _a = Object.keys(UI); _i < _a.length; _i++) {
            var uiKey = _a[_i];
            system.broadcastEvent("minecraft:unload_ui" /* UnloadUI */, UI[uiKey]);
        }
        system.broadcastEvent("minecraft:load_ui" /* LoadUI */, ui);
    }
    function unloadUI(ui) {
        system.broadcastEvent("minecraft:unload_ui" /* UnloadUI */, ui);
    }
    var UI;
    (function (UI) {
        UI["Lobby"] = "chess_start.html";
        UI["NewGame"] = "chess_new_game.html";
    })(UI || (UI = {}));
})(Client || (Client = {}));
