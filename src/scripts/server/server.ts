///<reference types="minecraft-scripting-types-server" />

import { GameBoard, PieceSet, PieceSetName, Piece } from '../chess';
import { ChessEvents, NotifyMouseCursor } from '../events';
import { PlayerLocation, Location2 } from '../maths';

namespace Server {
    const distanceBetweenGames: number = 32;
    const gameYLevel: number = 5;

    const system = server.registerSystem(0, 0);

    const gameBoards: GameBoard[] = [];
    const pieceSets: PieceSet[] = [
        {
            name: PieceSetName.Overworld,
            pieces: {
                king: "minecraft:vindicator",
                queen: "minecraft:witch",
                bishop: "minecraft:evocation_illager",
                knight: "minecraft:creeper", //TODO: Change to illager beast
                rook: "minecraft:slime",
                pawn: "minecraft:zombie"
            }
        }
    ]

    // Setup which events to listen for
    system.initialize = function () {
        system.listenForEvent(ChessEvents.JoinNewGame, onJoinNewGame);
        system.listenForEvent(ChessEvents.NotifyMouseCursor, onNotifyMouseCursor);
    }

    // per-tick updates
    system.update = function() {
        // Any logic that needs to happen every tick on the server.
    }

    function onNotifyMouseCursor(eventData: NotifyMouseCursor) {
        const gameBoard = gameBoards[eventData.gameId];
        if (!gameBoard) return;

        let highlightedBlock = gameBoard.highlightedBlock
        
        const startX = (gameBoard.location.x * distanceBetweenGames);
        const startZ = (gameBoard.location.z * distanceBetweenGames);

        eventData.x = Math.floor((eventData.x - startX) / 2);
        eventData.y = 5;
        eventData.z = Math.floor((eventData.z - startZ) / 2);
        
        if (!!highlightedBlock && highlightedBlock[0] == eventData.x && highlightedBlock[1] == eventData.y && highlightedBlock[2] == eventData.z) return;
        if (!!highlightedBlock) {
            const blockType = !!((eventData.x % 2) ^ (eventData.z % 2));
            const block = blockType ? 'concrete 15' : 'concrete 0';

            const command = `/fill ${startX + highlightedBlock[0] * 2} ${gameYLevel} ${startX + highlightedBlock[2] * 2} ${startX + highlightedBlock[0] * 2 + 1} ${gameYLevel} ${startX + highlightedBlock[2] * 2 + 1} ${block}`;
            executeCommand(command);
        }
                
        highlightedBlock = gameBoards[0].highlightedBlock = [eventData.x, eventData.y, eventData.z];
        const command = `/fill ${startX + highlightedBlock[0] * 2} ${gameYLevel} ${startX + highlightedBlock[2] * 2} ${startX + highlightedBlock[0] * 2 + 1} ${gameYLevel} ${startX + highlightedBlock[2] * 2 + 1} diamond_block`;
        executeCommand(command);
    }

    function onJoinNewGame(player: IEntityObject) {
        const game = findNewGame();
        
        game.players.push(player);

        setPlayerNumber(player, game.players.length, game);
        
        if (game.players.length == 2) {
            system.broadcastEvent(ChessEvents.GameStarting, game);
        }
    }

    function setPlayerNumber(player: IEntityObject, playerNumber: number, game: GameBoard) {
        const playerName = system.getComponent(player, MinecraftComponent.Nameable);
        const playerLocation: PlayerLocation = playerNumber == 1 ? {x: 7, y: 4, z: -2, rotation: 0} : {x: 7, y: 4, z: 18, rotation: 180}
        const movePlayerCommand = `/tp ${playerName.name} ${game.location.x * 32 + playerLocation.x} ${gameYLevel + playerLocation.y} ${game.location.z * 32 + playerLocation.z} ${playerLocation.rotation} 40`;
        executeCommand(movePlayerCommand);
        system.broadcastEvent(ChessEvents.SetPlayerNumber, {player: player, number: playerNumber});
    }

    function findNewGame() {
        let waitingGameBoard: GameBoard = null;
        let furthestExaminedLocation: Location2 = {x: 0, z: 0};
        
        for (const gameBoard of gameBoards) {
            furthestExaminedLocation = gameBoard.location;
            if (gameBoard.players.length < 2 && !gameBoard.hasStarted) {
                waitingGameBoard = gameBoard;
                break;
            }
        }

        if (waitingGameBoard == null) {
            waitingGameBoard = createGameBoard({
                x: furthestExaminedLocation.x + 1,
                z: furthestExaminedLocation.z
            });            
            gameBoards.push(waitingGameBoard);

        }

        return waitingGameBoard;        
    }

    function createGameBoard(location: Location2) {
        
        const gameBoard: GameBoard = {
            hasStarted: false,
            location: location, 
            players: [
                
            ],
            highlightedBlock: null
        }

        const startX = (distanceBetweenGames * location.x);
        const startZ = (distanceBetweenGames * location.z);
        
        system.broadcastEvent(SendToMinecraftServer.DisplayChat, `Creating new gameboard at ${startX}, ${startZ}`);

        let blockType: boolean = false;
        executeCommand(`/fill ${startX} ${gameYLevel} ${startZ} ${startX + 16} ${gameYLevel} ${startZ +16} air`);
        for (let z = 0; z < 8; z++) {
            for (let x = 0; x < 8; x++) {
                blockType = !!((x % 2) ^ (z % 2));
                const block = blockType ? 'concrete 15' : 'concrete 0';

                const command = `/fill ${startX + x * 2} ${gameYLevel} ${startZ + z * 2} ${startX + x * 2 + 1} ${gameYLevel} ${startZ + z * 2 + 1} ${block}`;
                executeCommand(command);
            }
        }

        const playerAPieceSet = pieceSets.filter(ps => ps.name === PieceSetName.Overworld)[0];
        const playerBPieceSet = pieceSets.filter(ps => ps.name === PieceSetName.Overworld)[0];
/*
        spawnPiece(playerAPieceSet, Piece.Rook  , startX + 0.5     , startZ + 0.5);
        spawnPiece(playerAPieceSet, Piece.Knight, startX + 0.5 +  2, startZ + 0.5);
        spawnPiece(playerAPieceSet, Piece.Bishop, startX + 0.5 +  4, startZ + 0.5);
        spawnPiece(playerAPieceSet, Piece.King  , startX + 0.5 +  6, startZ + 0.5);
        spawnPiece(playerAPieceSet, Piece.Queen , startX + 0.5 +  8, startZ + 0.5);
        spawnPiece(playerAPieceSet, Piece.Bishop, startX + 0.5 + 10, startZ + 0.5);
        spawnPiece(playerAPieceSet, Piece.Knight, startX + 0.5 + 12, startZ + 0.5);
        spawnPiece(playerAPieceSet, Piece.Rook  , startX + 0.5 + 14, startZ + 0.5);
        spawnPiece(playerAPieceSet, Piece.Pawn  , startX + 0.5     , startZ + 0.5 + 2);
        spawnPiece(playerAPieceSet, Piece.Pawn  , startX + 0.5 +  2, startZ + 0.5 + 2);
        spawnPiece(playerAPieceSet, Piece.Pawn  , startX + 0.5 +  4, startZ + 0.5 + 2);
        spawnPiece(playerAPieceSet, Piece.Pawn  , startX + 0.5 +  6, startZ + 0.5 + 2);
        spawnPiece(playerAPieceSet, Piece.Pawn  , startX + 0.5 +  8, startZ + 0.5 + 2);
        spawnPiece(playerAPieceSet, Piece.Pawn  , startX + 0.5 + 10, startZ + 0.5 + 2);
        spawnPiece(playerAPieceSet, Piece.Pawn  , startX + 0.5 + 12, startZ + 0.5 + 2);
        spawnPiece(playerAPieceSet, Piece.Pawn  , startX + 0.5 + 14, startZ + 0.5 + 2);

        spawnPiece(playerBPieceSet, Piece.Rook  , startX + 0.5     , startZ + 0.5 + 12);
        spawnPiece(playerBPieceSet, Piece.Knight, startX + 0.5 +  2, startZ + 0.5 + 12);
        spawnPiece(playerBPieceSet, Piece.Bishop, startX + 0.5 +  4, startZ + 0.5 + 12);
        spawnPiece(playerBPieceSet, Piece.King  , startX + 0.5 +  6, startZ + 0.5 + 12);
        spawnPiece(playerBPieceSet, Piece.Queen , startX + 0.5 +  8, startZ + 0.5 + 12);
        spawnPiece(playerBPieceSet, Piece.Bishop, startX + 0.5 + 10, startZ + 0.5 + 12);
        spawnPiece(playerBPieceSet, Piece.Knight, startX + 0.5 + 12, startZ + 0.5 + 12);
        spawnPiece(playerBPieceSet, Piece.Rook  , startX + 0.5 + 14, startZ + 0.5 + 12);
        spawnPiece(playerBPieceSet, Piece.Pawn  , startX + 0.5     , startZ + 0.5 + 14);
        spawnPiece(playerBPieceSet, Piece.Pawn  , startX + 0.5 +  2, startZ + 0.5 + 14);
        spawnPiece(playerBPieceSet, Piece.Pawn  , startX + 0.5 +  4, startZ + 0.5 + 14);
        spawnPiece(playerBPieceSet, Piece.Pawn  , startX + 0.5 +  6, startZ + 0.5 + 14);
        spawnPiece(playerBPieceSet, Piece.Pawn  , startX + 0.5 +  8, startZ + 0.5 + 14);
        spawnPiece(playerBPieceSet, Piece.Pawn  , startX + 0.5 + 10, startZ + 0.5 + 14);
        spawnPiece(playerBPieceSet, Piece.Pawn  , startX + 0.5 + 12, startZ + 0.5 + 14);
        spawnPiece(playerBPieceSet, Piece.Pawn  , startX + 0.5 + 14, startZ + 0.5 + 14);*/

        return gameBoard;
    }

    function spawnPiece(pieceSet: PieceSet, piece: Piece, x: number, z: number) {
        const entity = system.createEntity(EntityType.Entity, pieceSet.pieces[piece]);
        const position = system.getComponent(entity, MinecraftComponent.Position);
        position.x = x;
        position.y = gameYLevel + 1;
        position.z = z;
        system.applyComponentChanges(position);
    }

    function executeCommand(command: string) {
        system.broadcastEvent(SendToMinecraftServer.ExecuteCommand, command);
    }
}