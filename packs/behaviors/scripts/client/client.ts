///<reference types="minecraft-scripting-types-client" />

import { ChessEvents, ChessUIEvents, UIEventData, NotifyMouseCursorEvent, JoinGameEvent, SetPlayerNumberEvent } from '../events';
import { PlayerLocation } from '../maths';
import { GameInstance } from '../chess';
import { update as timerUpdate } from '../timer';

namespace Client {
    const system = client.registerSystem(0, 0);
    let thisClient: IEntity = null
    let playerNumber: number = null;
    let playerLocation: PlayerLocation;
    let pickHitLocation: VectorXYZ = null;
    let gameBoard: GameInstance;

    // Setup which events to listen for
    system.initialize = function () {
        system.registerEventData<NotifyMouseCursorEvent>(ChessEvents.NotifyMouseCursor, {
            gameId: 0,
            x: 0,
            y: 0,
            z: 0
        });
        system.registerEventData<JoinGameEvent>(ChessEvents.JoinNewGame, {
            client: null
        });

        // set up your listenToEvents and register client-side components here.
        // Setup callback for UI events from the custom screens
        system.listenForEvent(ReceiveFromMinecraftClient.UIEvent, onUIMessage);
        system.listenForEvent(ReceiveFromMinecraftClient.ClientEnteredWorld, onClientEnteredWorld);
        system.listenForEvent(ReceiveFromMinecraftClient.HitResultContinuous, onPickHitResultChanged);
        system.listenForEvent(ChessEvents.SetPlayerNumber, onSetPlayerNumber);
        system.listenForEvent(ChessEvents.GameStarting, onGameStarting);

        const scriptLoggerConfig = system.createEventData(SendToMinecraftClient.ScriptLoggerConfig);
        scriptLoggerConfig.data.log_errors = true;
        scriptLoggerConfig.data.log_information = true;
        scriptLoggerConfig.data.log_warnings = true;
        
        system.broadcastEvent(
            SendToMinecraftClient.ScriptLoggerConfig, 
            scriptLoggerConfig
        )
    }

    system.update = function () {
        timerUpdate();
    }

    function onPickHitResultChanged(eventData: IEventData<IPickHitResultContinuousEventData>) {
        pickHitLocation = eventData.data.position;
        if (!!pickHitLocation) {
            const mouseDataEvent = system.createEventData<NotifyMouseCursorEvent>(ChessEvents.NotifyMouseCursor);
            mouseDataEvent.data.gameId = 0;
            mouseDataEvent.data.x = pickHitLocation.x;
            mouseDataEvent.data.y = pickHitLocation.y;
            mouseDataEvent.data.z = pickHitLocation.z;
            system.broadcastEvent(ChessEvents.NotifyMouseCursor, mouseDataEvent);
        }
    }

    function onSetPlayerNumber(eventData: IEventData<SetPlayerNumberEvent>) {
        if (eventData.data.player.id !== thisClient.id) return;
        pickHitLocation = null;
        playerNumber = eventData.data.number;
    }

    function onClientEnteredWorld(eventData: IEventData<IClientEnteredWorldEventData>) {
        loadUI(UI.Lobby);
        thisClient = eventData.data.player;
    }

    function onGameStarting(game: IEventData<GameInstance>) {
        if (!game.data.players.some(p => p.id === thisClient.id)) return;
        gameBoard = game.data;
        unloadUI(UI.Lobby);
        //loadUI(UI.NewGame);
    }

    function onUIMessage(event: IEventData<string>) {
        const eventData = <UIEventData>JSON.parse(event.data);
        switch (eventData.name) {
            case ChessUIEvents.JoinGame:
                const joinGameEvent = system.createEventData<JoinGameEvent>(ChessEvents.JoinNewGame);
                joinGameEvent.data.client = thisClient;

                system.broadcastEvent(ChessEvents.JoinNewGame, joinGameEvent);
                break;
            case ChessUIEvents.CloseUI:
                unloadUI();
                break;
        }
    }

    function loadUI(ui: UI) {
        unloadUI();

        const loadUIEvent = system.createEventData(SendToMinecraftClient.LoadUI);
        loadUIEvent.data.path = ui;

        system.broadcastEvent(SendToMinecraftClient.LoadUI, loadUIEvent)
    }

    function unloadUI(ui?: UI) {
        if (ui === undefined) {
            unloadUI(UI.Lobby);
            unloadUI(UI.NewGame);
        }

        const unloadUIEvent = system.createEventData(SendToMinecraftClient.UnloadUI);
        unloadUIEvent.data.path = ui;

        system.broadcastEvent(SendToMinecraftClient.UnloadUI, unloadUIEvent);
    }

    enum UI {
        Lobby = "chess_start.html",
        NewGame = "chess_new_game.html"
    }
}