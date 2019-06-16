/// <reference types="minecraft-scripting-types-server" />

import { Piece, PieceColour, MarkerComponent, ChessComponents, ChessPieceComponent, GameInstance } from '../chess';
import { ChessEvents, NotifyMouseCursorEvent, SetPlayerNumberEvent, JoinGameEvent } from '../events';
import { VectorXZ } from '../maths';
import { GameState } from '../logic/GameState';
import { GameManager } from '../logic/GameManager';

namespace Server {
    const system = server.registerSystem(0, 0);

    const gameInstances: GameManager[] = [];

    // Setup which events to listen for
    system.initialize = function () {
        system.registerEventData<GameInstance>(ChessEvents.GameStarting, {
            location: {x: 0, z: 0},
            players: [],
            worldLocation: {x: 0, z: 0}
        });
        system.registerEventData<SetPlayerNumberEvent>(ChessEvents.SetPlayerNumber, {
            player: null,
            number: 0
        });

        system.listenForEvent(ChessEvents.JoinNewGame, onJoinNewGame);
        system.listenForEvent(ChessEvents.NotifyMouseCursor, onNotifyMouseCursor);
        system.listenForEvent(ReceiveFromMinecraftServer.PlayerAttackedEntity, onPlayerAttack);

        system.registerComponent(ChessComponents.ChessPiece, <ChessPieceComponent>{
            type: Piece.King,
            colour: PieceColour.Black,
            forwardVectorZ: 1
        });
        system.registerComponent(ChessComponents.Marker, <MarkerComponent>{
            position: {
                x: 0,
                z: 0
            }
        });

        const scriptLoggerConfig = system.createEventData(SendToMinecraftServer.ScriptLoggerConfig);
        scriptLoggerConfig.data.log_errors = true;
        scriptLoggerConfig.data.log_information = true;
        scriptLoggerConfig.data.log_warnings = true;
        
        system.broadcastEvent(
            SendToMinecraftServer.ScriptLoggerConfig, 
            scriptLoggerConfig
        )
    }

    function onPlayerAttack(eventData: IEventData<IPlayerAttackedEntityEventData>) {
        const playerGames = gameInstances.filter(gb => gb.hasPlayer(eventData.data.player.id));
        if (playerGames.length === 0) {
            const displayChatEvent = system.createEventData(SendToMinecraftServer.DisplayChat);
            displayChatEvent.data.message = `You are not in a game`;
            system.broadcastEvent(SendToMinecraftServer.DisplayChat, displayChatEvent);
            return;
        };

        const game = playerGames[0];
        game.processPlayerSelect(eventData.data.player, eventData.data.attacked_entity);
    }

    function onNotifyMouseCursor(eventData: IEventData<NotifyMouseCursorEvent>) {
        const gameState = gameInstances[eventData.data.gameId];
        if (!gameState) return;
        const game = gameState;

        game.highlightBlock(eventData.data.x, eventData.data.z)
    }

    function onJoinNewGame(player: IEventData<JoinGameEvent>) {
        const game = findNewGame();
        const playerCount = game.addPlayer(player.data.client);

        if (playerCount == 2) {
            game.start();
        }
    }

    function findNewGame() {
        let waitingGameBoard: GameManager = null;
        let furthestExaminedLocation: VectorXZ = { x: -1, z: 0 };

        for (let game of gameInstances) {
            furthestExaminedLocation = game.location;
            if (!game.hasStarted) {
                waitingGameBoard = game;
                break;
            }
        }

        if (waitingGameBoard == null) {
            waitingGameBoard = createGame({
                x: furthestExaminedLocation.x + 1,
                z: furthestExaminedLocation.z
            });
            gameInstances.push(waitingGameBoard);
        }

        return waitingGameBoard;
    }

    function createGame(location: VectorXZ) {
        const game = new GameState(location);
        const gameManager = new GameManager(system, game);
        const gameWorldLocation = game.getWorldPosition(0, 0);
        const displayChatEvent = system.createEventData(SendToMinecraftServer.DisplayChat);
        displayChatEvent.data.message = `Creating new gameboard at ${gameWorldLocation.x}, ${gameWorldLocation.z}`
        system.broadcastEvent(SendToMinecraftServer.DisplayChat, displayChatEvent);
        gameManager.initialize();
        return gameManager;
    }
}
