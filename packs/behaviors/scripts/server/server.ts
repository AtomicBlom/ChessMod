/// <reference types="minecraft-scripting-types-server" />

import { Piece, PieceColour, MarkerComponent, ChessComponents, ChessPieceComponent } from '../chess';
import { ChessEvents, NotifyMouseCursor } from '../events';
import { VectorXZ } from '../maths';
import { GameState } from '../logic/GameState';
import { GameManager } from '../logic/GameManager';

namespace Server {
    const system = server.registerSystem(0, 0);

    const gameInstances: GameManager[] = [];

    // Setup which events to listen for
    system.initialize = function () {
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
    }

    function onPlayerAttack(eventData: IPlayerAttackedEntityEventData) {
        const playerGames = gameInstances.filter(gb => gb.hasPlayer(eventData.player.id));
        if (playerGames.length === 0) {
            system.broadcastEvent(SendToMinecraftServer.DisplayChat, `You are not in a game`);
            return;
        };

        const game = playerGames[0];
        game.processPlayerSelect(eventData.player, eventData.attacked_entity);
    }

    function onNotifyMouseCursor(eventData: NotifyMouseCursor) {
        const gameState = gameInstances[eventData.gameId];
        if (!gameState) return;
        const game = gameState;

        game.highlightBlock(eventData.x, eventData.z)
    }

    function onJoinNewGame(player: IEntity) {
        const game = findNewGame();
        const playerCount = game.addPlayer(player);

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
        system.broadcastEvent(SendToMinecraftServer.DisplayChat, `Creating new gameboard at ${gameWorldLocation.x}, ${gameWorldLocation.z}`);
        gameManager.initialize();
        return gameManager;
    }
}
