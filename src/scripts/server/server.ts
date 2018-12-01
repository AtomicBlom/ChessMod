import { ChessEvents, GameBoard, Location2, PieceSet, PieceSetName, Piece, PlayerLocation } from "../common";

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
        system.listenForEvent(ChessEvents.JoinNewGame, onJoinNewGame)
    }

    // per-tick updates
    system.update = function() {
        // Any logic that needs to happen every tick on the server.
    }

    function onJoinNewGame(player: IEntityObject) {
        const game = findNewGame();
        
        game.players.push(player);

        const playerName = system.getComponent(player, MinecraftComponent.Nameable);
        const playerLocation: PlayerLocation = game.players.indexOf(player) == 0 ? {x: 7, y: 4, z: -2} : {x: 0, y: 0, z: 0}
        const movePlayerCommand = `/tp ${playerName.name} ${game.location.x * 32 + playerLocation.x} ${gameYLevel + playerLocation.y} ${game.location.z * 32 + playerLocation.z} 0 40`;
        executeCommand(movePlayerCommand);

        if (game.players.length == 2) {
            system.broadcastEvent(ChessEvents.GameStarting, game);
        }
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
                
            ]
        }

        const startX = (distanceBetweenGames * location.x);
        const startZ = (distanceBetweenGames * location.z);
        
        system.broadcastEvent(BroadcastableServerEvent.DisplayChat, `Creating new gameboard at ${startX}, ${startZ}`);

        let blockType: boolean = false;
        for (let z = startZ; z < startZ + 16; z+=2) {
            blockType = !blockType;
            for (let x = startX; x < startX + 16; x+=2) {
                blockType = !blockType;
                const block = blockType ? 'concrete 15' : 'concrete 0';

                const command = `/fill ${x} ${gameYLevel} ${z} ${x+1} ${gameYLevel} ${z + 1} ${block}`;
                executeCommand(command);
            }
        }

        const playerAPieceSet = pieceSets.filter(ps => ps.name === PieceSetName.Overworld)[0];
        const playerBPieceSet = pieceSets.filter(ps => ps.name === PieceSetName.Overworld)[0];

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
        spawnPiece(playerBPieceSet, Piece.Pawn  , startX + 0.5 + 14, startZ + 0.5 + 14);

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
        system.broadcastEvent(BroadcastableServerEvent.ExecuteCommand, command);
    }
}