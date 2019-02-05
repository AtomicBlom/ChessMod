///<reference types="minecraft-scripting-types-client" />

import { ChessEvents, SetPlayerNumberData, ChessUIEvents, UIEventData, MouseMoveUIEventData, NotifyMouseCursor } from '../events';
import { PlayerLocation } from '../maths';
import { GameInstance } from '../chess';
import { update as timerUpdate, timeout, update } from '../timer';

namespace Client {
    const system = client.registerSystem(0, 0);
    let thisClient: IEntity = null
    let playerNumber: number = null;
    let playerLocation: PlayerLocation;
    let pickHitLocation: VectorXYZ = null;
    let gameBoard: GameInstance;

    // Setup which events to listen for
    system.initialize = function () {
        // set up your listenToEvents and register client-side components here.
            // Setup callback for UI events from the custom screens
        system.listenForEvent(ReceiveFromMinecraftClient.UIEvent, onUIMessage);
        system.listenForEvent(ReceiveFromMinecraftClient.ClientEnteredWorld, onClientEnteredWorld);
        system.listenForEvent(ChessEvents.SetPlayerNumber, onSetPlayerNumber);
        system.listenForEvent(ReceiveFromMinecraftClient.HitResultContinuous, onPickHitResultChanged);
        system.listenForEvent(ChessEvents.GameStarting, onGameStarting);
    }

    system.update = function () {
        timerUpdate();
    }

    function onPickHitResultChanged(eventData: IPickHitResultContinuousEventData) {
        pickHitLocation = eventData.position;
        if (!!pickHitLocation) {
            const mouseData: NotifyMouseCursor = {
                gameId: 0, x: pickHitLocation.x, y: pickHitLocation.y, z: pickHitLocation.z
            };
            system.broadcastEvent(ChessEvents.NotifyMouseCursor, mouseData);
        }
    }

    function onSetPlayerNumber(eventData: SetPlayerNumberData) {
        if (eventData.player.id !== thisClient.id) return;
        pickHitLocation = null;
        playerNumber = eventData.number;
    }

    function onClientEnteredWorld(eventData: IClientEnteredWorldEventData) {
        loadUI(UI.Lobby);
        thisClient = eventData.player;
    }

    function onGameStarting(game: GameInstance) {
        if (!game.players.some(p => p.id === thisClient.id)) return;
        gameBoard = game;
        unloadUI(UI.Lobby);
        //loadUI(UI.NewGame);
    }

    function onUIMessage(event: string) {
        const eventData = <UIEventData>JSON.parse(event);
        switch (eventData.name) {
            case ChessUIEvents.JoinGame:
                system.broadcastEvent(ChessEvents.JoinNewGame, thisClient);
                break;
            case ChessUIEvents.CloseUI:
                unloadUI();
                break;
        }
    }

    function loadUI(ui: UI) {
        unloadUI();
        const uiParameters: ILoadUIParameters = {
            path: ui,
            /*options: {
                is_showing_menu: true,
                always_accepts_input: true,
                should_steal_mouse: true,
                absorbs_input: true,
            }*/
        }
        system.broadcastEvent(SendToMinecraftClient.LoadUI, uiParameters)
    }

    function unloadUI(ui?: UI) {
        if (ui === undefined) {
            unloadUI(UI.Lobby);
            unloadUI(UI.NewGame);
        }
        system.broadcastEvent(SendToMinecraftClient.UnloadUI, { path: ui });
    }

    enum UI {
        Lobby = "chess_start.html",
        NewGame = "chess_new_game.html"
    }
}