///<reference types="minecraft-scripting-types-client" />

import { ChessEvents, SetPlayerNumberData, ChessUIEvents, UIEventData, MouseMoveUIEventData, NotifyMouseCursor } from '../events';
import { PlayerLocation } from '../maths';
import { GameBoard } from '../chess'

namespace Client {
    const system = client.registerSystem(0, 0);
    let thisClient: IEntityObject = null
    let playerNumber: number = null;
    let playerLocation: PlayerLocation;
    let pickHitLocation: {X: number, Y: number, Z: number} = null;
    let gameBoard: GameBoard;

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
        if (!!gameBoard && !!gameBoard.location) {
            playerLocation = {
                x: 7 + 32 * gameBoard.location.x,
                y: 9 + 1.7,
                z: (playerNumber == 1 ? -2 : 18) + 32 * gameBoard.location.z,
                rotation:  ((playerNumber == 1 ? 0 : 180) * Math.PI / 180.0)
            }
        }
        //playerLocation = playerNumber == 1 ? {x: 7, y: 4, z: -2, rotation: 0} : {x: 7, y: 4, z: 18, rotation: 180}
    }

    function onPickHitResultChanged(eventData: IPickHitResultContinuousEvent) {
        pickHitLocation = <{X: number, Y: number, Z: number}><any>eventData.position;
        if (!!pickHitLocation) {
            const mouseData: NotifyMouseCursor = {
                gameId: 0, x: pickHitLocation.X, y: pickHitLocation.Y, z: pickHitLocation.Z
            };
            system.broadcastEvent(ChessEvents.NotifyMouseCursor, mouseData);
        }
    }

    function onSetPlayerNumber(eventData: SetPlayerNumberData) {
        if (eventData.player.id !== thisClient.id) return;
        pickHitLocation = null;
        playerNumber = eventData.number;
    }

    function onClientEnteredWorld(eventData: IEntityObject) {
        loadUI(UI.Lobby);
        thisClient = eventData;
    }

    function onGameStarting(game: GameBoard) {
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
        system.broadcastEvent(SendToMinecraftClient.LoadUI, ui)
    }

    function unloadUI(ui?: UI) {
        if (ui === undefined) {
            unloadUI(UI.Lobby);
            unloadUI(UI.NewGame);
        }
        system.broadcastEvent(SendToMinecraftClient.UnloadUI, ui)
    }

    enum UI {
        Lobby = "chess_start.html",
        NewGame = "chess_new_game.html"
    }
}