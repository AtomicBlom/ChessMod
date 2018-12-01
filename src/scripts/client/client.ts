import { ChessEvents, GameBoard } from "../common";

namespace Client {
    const system = client.registerSystem(0, 0);
    let playerData: IEntityObject = null
    // Setup which events to listen for
    system.initialize = function () {
        // set up your listenToEvents and register client-side components here.
            // Setup callback for UI events from the custom screens
        system.listenForEvent(MinecraftClientEvent.UIEvent, onUIMessage);
        system.listenForEvent(MinecraftClientEvent.ClientEnteredWorld, onClientEnteredWorld);
        system.listenForEvent(MinecraftClientEvent.PickHitResultChanged, onPickHitResultChanged);

        system.listenForEvent(ChessEvents.GameStarting, onGameStarting);
    }

    function onPickHitResultChanged(eventData: IPickHitResultChangedEvent) {
        //system.broadcastEvent(BroadcastableClientEvent.DisplayChat, `Pick hit changed: ${eventData.entity} @ ${JSON.stringify(eventData.position)}`);
    }

    function onClientEnteredWorld(eventData: IEntityObject) {
        loadUI(UI.Lobby);
        playerData = eventData;
    }

    function onGameStarting(game: GameBoard) {
        if (!game.players.some(p => p.id === playerData.id)) return;
        loadUI(UI.NewGame);
    }

    function onUIMessage(eventData: string) {
        switch (eventData) {
            case "chess:join_game":
                unloadUI(UI.Lobby);
                system.broadcastEvent(ChessEvents.JoinNewGame, playerData);
                break;
            case "chess:close_ui":
                unloadUI(UI.Lobby);
                break;
        }
    }

    function loadUI(ui: UI) {
        for (const uiKey of Object.keys(UI)) {
            system.broadcastEvent(BroadcastableClientEvent.UnloadUI, UI[uiKey as any]);
        } 
        system.broadcastEvent(BroadcastableClientEvent.LoadUI, ui)
    }

    function unloadUI(ui: UI) {
        system.broadcastEvent(BroadcastableClientEvent.UnloadUI, ui)
    }

    enum UI {
        Lobby = "chess_start.html",
        NewGame = "chess_new_game.html"
    }
}