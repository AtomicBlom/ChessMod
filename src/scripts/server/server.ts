///<reference types="minecraft-scripting-types-server" />

import { GameBoard, PieceSet, PieceSetName, Piece, PieceColour } from '../chess';
import { ChessEvents, NotifyMouseCursor } from '../events';
import { PlayerLocation, VectorXZ, VectorXYZ } from '../maths';

namespace Server {
    const distanceBetweenGames: number = 32;
    const gameYLevel: number = 5;
    const MARKER_ENTITY: string = "minecraft:bat";

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

    let spatialView: ISpatialView;

    // Setup which events to listen for
    system.initialize = function () {
        system.listenForEvent(ChessEvents.JoinNewGame, onJoinNewGame);
        system.listenForEvent(ChessEvents.NotifyMouseCursor, onNotifyMouseCursor);
        system.listenForEvent(ReceiveFromMinecraftServer.PlayerAttackedActor, onPlayerAttack);

        spatialView = system.registerSpatialView(MinecraftComponent.Position, "x", "y", "z");

        system.registerComponent(ChessComponents.ChessPiece, <ChessPieceComponent>{
            type: Piece.King,
            colour: PieceColour.Black,
            forwardVectorZ: 1
        } )
        system.registerComponent(ChessComponents.Marker, <MarkerComponent>{
            position: {
                x: 0,
                z: 0
            }
        });
    }

    function onPlayerAttack(eventData: IPlayerAttackedActorEventData) {
        const playerGames = gameBoards.filter(gb => gb.players.some(p => p.id === eventData.player.id));
        if (playerGames.length === 0) return;

        const game = playerGames[0];

        //FIXME: verify player is the current player.
        const health = system.getComponent(eventData.attacked_entity, MinecraftComponent.Health);
        health.health = health.maxHealth;
        system.applyComponentChanges(health);

        const chessPiece = system.getComponent<ChessPieceComponent>(eventData.attacked_entity, ChessComponents.ChessPiece);
        if (!!chessPiece) {
            const position = system.getComponent(eventData.attacked_entity, MinecraftComponent.Position);
            const boardPosition = getBoardPosition(game, position.x, position.z);
            if (!!boardPosition) {
                system.broadcastEvent(SendToMinecraftServer.DisplayChat, `Selected ${chessPiece.colour} ${chessPiece.type} at ${boardPosition.x},${boardPosition.z}`);
                game.selectedPiece = eventData.attacked_entity;
                createMarkers(game, chessPiece, boardPosition);
            }
        } else if (!!system.getComponent(eventData.attacked_entity, ChessComponents.Marker)) {
            const position = system.getComponent(eventData.attacked_entity, MinecraftComponent.Position);
            const boardPosition = getBoardPosition(game, position.x, position.z);
            if (!!boardPosition) {
                system.broadcastEvent(SendToMinecraftServer.DisplayChat, `Moving piece to ${boardPosition.x},${boardPosition.z}`);

                movePiece(game, game.selectedPiece, boardPosition);
                removeMarkers(game);
            }
        }
    }

    function movePiece(game: GameBoard, entity: IEntityObject, boardPosition: VectorXZ) {
        const worldPosition = getEntityWorldPosition(game, boardPosition.x, boardPosition.z);

        const position = system.getComponent(entity, MinecraftComponent.Position);        
        position.x = worldPosition.x;
        position.z = worldPosition.z;
        system.applyComponentChanges(position);
    }

    function getBoardPosition(game: GameBoard, worldX: number, worldZ: number) {
        const startX = (game.location.x * distanceBetweenGames);
        const startZ = (game.location.z * distanceBetweenGames);

        const boardPosition: VectorXZ = {
            x: Math.floor((worldX - startX) / 2),
            z: Math.floor((worldZ - startZ) / 2)
        }
        if (boardPosition.x < 0 || boardPosition.x >= 8) return null;
        if (boardPosition.z < 0 || boardPosition.z >= 8) return null;
        return boardPosition;
    }

    function getWorldPosition(game: GameBoard, boardX: number, boardZ: number) {
        if (boardX < 0 || boardX >= 8) return null;
        if (boardZ < 0 || boardZ >= 8) return null;

        const startX = (game.location.x * distanceBetweenGames);
        const startZ = (game.location.z * distanceBetweenGames);

        const worldPosition: VectorXZ = {
            x: startX + boardX * 2,
            z: startZ + boardZ * 2
        }
        return worldPosition;
    }

    function getEntityWorldPosition(game: GameBoard, boardX: number, boardZ: number) {
        var worldPosition = getWorldPosition(game, boardX, boardZ);
        if (!worldPosition) return null;

        const entityPosition: VectorXYZ = {
            x: worldPosition.x + 1,
            y: gameYLevel + 1,
            z: worldPosition.z + 1
        }
        return entityPosition;
    }

    function createMarkers(game: GameBoard, piece: ChessPieceComponent, boardPosition: VectorXZ) {
        switch(piece.type) {
            case Piece.Pawn:
                return createPawnMarkers(game, boardPosition, piece.forwardVectorZ);
            case Piece.Bishop:
                return createBishopMarkers(game, boardPosition);
            case Piece.Rook:
                return createRookMarkers(game, boardPosition);
            case Piece.Queen:
                return createQueenMarkers(game, boardPosition);
            case Piece.King:
                return createKingMarkers(game, boardPosition);
            case Piece.Knight:
                return createKnightMarkers(game, boardPosition);
        }
    }

    function createPawnMarkers(game: GameBoard, boardPosition: VectorXZ, forwardVectorZ: number) {
        let canPlace = true;
        canPlace = canPlace && createMarker(game, boardPosition.x, boardPosition.z + 1 * forwardVectorZ, false);
        canPlace = canPlace && createMarker(game, boardPosition.x, boardPosition.z + 2 * forwardVectorZ, false);
    }

    function createBishopMarkers(game: GameBoard, boardPosition: VectorXZ) {
        const directions :VectorXZ[] = [{x: 1, z: 1}, {x: -1, z: 1}, {x: 1, z: -1}, {x: -1, z: -1}];

        for (const direction of directions) {
            let position: VectorXZ = {x: boardPosition.x, z: boardPosition.z};
            let canPlace = true;
            while (canPlace) {
                position.x += direction.x;
                position.z += direction.z;
                canPlace = createMarker(game, position.x, position.z, true);
            }
        }
    }

    function createRookMarkers(game: GameBoard, boardPosition: VectorXZ) {
        const directions :VectorXZ[] = [{x: 1, z: 0}, {x: -1, z: 0}, {x: 0, z: -1}, {x: 0, z: 1}];
        
        for (const direction of directions) {
            let position: VectorXZ = {x: boardPosition.x, z: boardPosition.z};
            let canPlace = true;
            while (canPlace) {
                position.x += direction.x;
                position.z += direction.z;
                canPlace = createMarker(game, position.x, position.z, true);
            }
        }
    }

    function createQueenMarkers(game: GameBoard, boardPosition: VectorXZ) {
        const directions :VectorXZ[] = [
            {x: 1, z: 0}, {x: -1, z: 0}, {x: 0, z: -1}, {x: 0, z: 1},
            {x: 1, z: 1}, {x: -1, z: 1}, {x: 1, z: -1}, {x: -1, z: -1}
        ];
        
        for (const direction of directions) {
            let position: VectorXZ = {x: boardPosition.x, z: boardPosition.z};
            let canPlace = true;
            while (canPlace) {
                position.x += direction.x;
                position.z += direction.z;
                canPlace = createMarker(game, position.x, position.z, true);
            }
        }
    }

    function createKingMarkers(game: GameBoard, boardPosition: VectorXZ) {
        const directions :VectorXZ[] = [
            {x: 1, z: 0}, {x: -1, z: 0}, {x: 0, z: -1}, {x: 0, z: 1},
            {x: 1, z: 1}, {x: -1, z: 1}, {x: 1, z: -1}, {x: -1, z: -1}
        ];
        
        for (const direction of directions) {
            let position: VectorXZ = {x: boardPosition.x, z: boardPosition.z};
            position.x += direction.x;
            position.z += direction.z;
            createMarker(game, position.x, position.z, true);
        }
    }

    function createKnightMarkers(game: GameBoard, boardPosition: VectorXZ) {
        const directions :VectorXZ[] = [
            {x: -1, z: -2}, {x: 1, z: -2}, {x: -2, z: -1}, {x: 2, z: -1},
            {x: -2, z: 1}, {x: 2, z: 1}, {x: -1, z: 2}, {x: 1, z: 2}
        ];        
        
        for (const direction of directions) {
            let position: VectorXZ = {x: boardPosition.x, z: boardPosition.z};
            position.x += direction.x;
            position.z += direction.z;
            createMarker(game, position.x, position.z, true);
        }
    }

    function removeMarkers(game: GameBoard) {
        const worldPosition = getWorldPosition(game, 0, 0);
        const entities = system.getEntitiesFromSpatialView(spatialView, worldPosition.x - 8, 0, worldPosition.z, worldPosition.x + 16 + 8, 16, worldPosition.z + 16 + 8);
        for (const entity of entities) {
            if (!system.getComponent(entity, ChessComponents.Marker)) continue;
            system.destroyEntity(entity);
        }
    }

    function getPieceAtBoardLocation(game: GameBoard, x: number, z: number) {
        const worldPosition = getWorldPosition(game, x, z);
        const entities = system.getEntitiesFromSpatialView(
            spatialView, 
            worldPosition.x, gameYLevel, worldPosition.z,
            worldPosition.x + 1, gameYLevel + 2, worldPosition.z + 1)
        for (const entity of entities) {
            const chessPiece = system.getComponent<ChessPieceComponent>(entity, ChessComponents.ChessPiece);
            if (!!chessPiece) return chessPiece;
        }
        return null;
    }

    function createMarker(game: GameBoard, x: number, z: number, canAttack?: boolean): boolean {
        if (x < 0 || x >= 8) return false;
        if (z < 0 || z >= 8) return false;
        //FIXME: Verify can place marker.
        const piece = getPieceAtBoardLocation(game, x, z);
        if (!!piece) {
            if (canAttack) {
                //FIXME: Place attack marker.
            }
            //Cannot proceed past this piece
            return false;
        }

        const worldPosition = getEntityWorldPosition(game, x, z);

        const entity = system.createEntity(EntityType.Entity, MARKER_ENTITY);
        const position = system.getComponent(entity, MinecraftComponent.Position);
        const rotation = system.getComponent(entity, MinecraftComponent.Rotation);
        const marker = system.createComponent<MarkerComponent>(entity, ChessComponents.Marker);
     
        position.x = worldPosition.x;
        position.y = gameYLevel + 1;
        position.z = worldPosition.z;
        marker.position = {
            x: x,
            z: z
        };

        system.applyComponentChanges(position);
        system.applyComponentChanges(rotation);
        system.applyComponentChanges(marker);

        return true;
    }

    function onNotifyMouseCursor(eventData: NotifyMouseCursor) {
        const gameBoard = gameBoards[eventData.gameId];
        if (!gameBoard) return;

        let highlightedBlock = gameBoard.highlightedBlock
        
        const boardPosition = getBoardPosition(gameBoard, eventData.x, eventData.z);
                
        if (!!highlightedBlock) {
            if (!!boardPosition && (highlightedBlock.x == boardPosition.x && highlightedBlock.z == boardPosition.z)) return;

            const block = getBlockType(highlightedBlock);
            const worldPosition = getWorldPosition(gameBoard, highlightedBlock.x, highlightedBlock.z)
            const command = `/fill ${worldPosition.x} ${gameYLevel} ${worldPosition.z} ${worldPosition.x + 1} ${gameYLevel} ${worldPosition.z + 1} ${block}`;
            executeCommand(command);
        }

        if (!!boardPosition) {
            const worldPosition = getWorldPosition(gameBoard, boardPosition.x, boardPosition.z)
            
            const command = `/fill ${worldPosition.x} ${gameYLevel} ${worldPosition.z} ${worldPosition.x + 1} ${gameYLevel} ${worldPosition.z + 1} diamond_block`;
            executeCommand(command);
        }
        gameBoards[0].highlightedBlock = boardPosition;
    }

    function getBlockType(boardPosition: VectorXZ) {
        const blockType = !!((boardPosition.x % 2) ^ (boardPosition.z % 2));
        const block = blockType ? 'concrete 15' : 'concrete 0';
        return block;
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
        let furthestExaminedLocation: VectorXZ = {x: -1, z: 0};
        
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

    function createGameBoard(location: VectorXZ) {
        
        const gameBoard: GameBoard = {
            hasStarted: false,
            location: location, 
            players: [
                
            ],
            highlightedBlock: null,
            selectedPiece: null
        }

        const startX = (distanceBetweenGames * location.x);
        const startZ = (distanceBetweenGames * location.z);
        
        system.broadcastEvent(SendToMinecraftServer.DisplayChat, `Creating new gameboard at ${startX}, ${startZ}`);

        executeCommand(`/fill ${startX} ${gameYLevel} ${startZ} ${startX + 16} ${gameYLevel} ${startZ +16} air`);
        for (let z = 0; z < 8; z++) {
            for (let x = 0; x < 8; x++) {
                const block = getBlockType({x: x, z: z});
                const command = `/fill ${startX + x * 2} ${gameYLevel} ${startZ + z * 2} ${startX + x * 2 + 1} ${gameYLevel} ${startZ + z * 2 + 1} ${block}`;
                executeCommand(command);
            }
        }

        const playerAPieceSet = pieceSets.filter(ps => ps.name === PieceSetName.Overworld)[0];
        const playerBPieceSet = pieceSets.filter(ps => ps.name === PieceSetName.Overworld)[0];

        const entities = system.getEntitiesFromSpatialView(spatialView, startX - 8, 0, startZ, startX + 16 + 8, 16, startZ + 16 + 8);
        for (const entity of entities) {
            if (entity.__identifier__ === "minecraft:player") continue;
            system.destroyEntity(entity);
        }

        spawnPiece(gameBoard, playerAPieceSet, Piece.Rook  , PieceColour.White, 0, 0);
        spawnPiece(gameBoard, playerAPieceSet, Piece.Knight, PieceColour.White, 1, 0);
        spawnPiece(gameBoard, playerAPieceSet, Piece.Bishop, PieceColour.White, 2, 0);
        spawnPiece(gameBoard, playerAPieceSet, Piece.King  , PieceColour.White, 3, 0);
        spawnPiece(gameBoard, playerAPieceSet, Piece.Queen , PieceColour.White, 4, 0);
        spawnPiece(gameBoard, playerAPieceSet, Piece.Bishop, PieceColour.White, 5, 0);
        spawnPiece(gameBoard, playerAPieceSet, Piece.Knight, PieceColour.White, 6, 0);
        spawnPiece(gameBoard, playerAPieceSet, Piece.Rook  , PieceColour.White, 7, 0);
        spawnPiece(gameBoard, playerAPieceSet, Piece.Pawn  , PieceColour.White, 0, 1);
        spawnPiece(gameBoard, playerAPieceSet, Piece.Pawn  , PieceColour.White, 1, 1);
        spawnPiece(gameBoard, playerAPieceSet, Piece.Pawn  , PieceColour.White, 2, 1);
        spawnPiece(gameBoard, playerAPieceSet, Piece.Pawn  , PieceColour.White, 3, 1);
        spawnPiece(gameBoard, playerAPieceSet, Piece.Pawn  , PieceColour.White, 4, 1);
        spawnPiece(gameBoard, playerAPieceSet, Piece.Pawn  , PieceColour.White, 5, 1);
        spawnPiece(gameBoard, playerAPieceSet, Piece.Pawn  , PieceColour.White, 6, 1);
        spawnPiece(gameBoard, playerAPieceSet, Piece.Pawn  , PieceColour.White, 7, 1);

        spawnPiece(gameBoard, playerBPieceSet, Piece.Rook  , PieceColour.Black, 0, 7);
        spawnPiece(gameBoard, playerBPieceSet, Piece.Knight, PieceColour.Black, 1, 7);
        spawnPiece(gameBoard, playerBPieceSet, Piece.Bishop, PieceColour.Black, 2, 7);
        spawnPiece(gameBoard, playerBPieceSet, Piece.King  , PieceColour.Black, 3, 7);
        spawnPiece(gameBoard, playerBPieceSet, Piece.Queen , PieceColour.Black, 4, 7);
        spawnPiece(gameBoard, playerBPieceSet, Piece.Bishop, PieceColour.Black, 5, 7);
        spawnPiece(gameBoard, playerBPieceSet, Piece.Knight, PieceColour.Black, 6, 7);
        spawnPiece(gameBoard, playerBPieceSet, Piece.Rook  , PieceColour.Black, 7, 7);
        spawnPiece(gameBoard, playerBPieceSet, Piece.Pawn  , PieceColour.Black, 0, 6);
        spawnPiece(gameBoard, playerBPieceSet, Piece.Pawn  , PieceColour.Black, 1, 6);
        spawnPiece(gameBoard, playerBPieceSet, Piece.Pawn  , PieceColour.Black, 2, 6);
        spawnPiece(gameBoard, playerBPieceSet, Piece.Pawn  , PieceColour.Black, 3, 6);
        spawnPiece(gameBoard, playerBPieceSet, Piece.Pawn  , PieceColour.Black, 4, 6);
        spawnPiece(gameBoard, playerBPieceSet, Piece.Pawn  , PieceColour.Black, 5, 6);
        spawnPiece(gameBoard, playerBPieceSet, Piece.Pawn  , PieceColour.Black, 6, 6);
        spawnPiece(gameBoard, playerBPieceSet, Piece.Pawn  , PieceColour.Black, 7, 6)
        return gameBoard;
    }

    function spawnPiece(game: GameBoard, pieceSet: PieceSet, piece: Piece, colour: PieceColour, x: number, z: number) {
        const entity = system.createEntity(EntityType.Entity, pieceSet.pieces[piece]);
        const chessPiece = system.createComponent<ChessPieceComponent>(entity, ChessComponents.ChessPiece)
        const position = system.getComponent(entity, MinecraftComponent.Position);
        const rotation = system.getComponent(entity, MinecraftComponent.Rotation);

        const worldPosition = getEntityWorldPosition(game, x, z);

        chessPiece.type = piece;
        chessPiece.colour = colour;
        chessPiece.forwardVectorZ = colour === PieceColour.White ? 1 : -1; 
        position.x = worldPosition.x;
        position.y = gameYLevel + 1;
        position.z = worldPosition.z;
        rotation.y = colour === PieceColour.Black ? 180 : 0;

        system.applyComponentChanges(chessPiece);
        system.applyComponentChanges(position);
        system.applyComponentChanges(rotation);
    }

    function executeCommand(command: string) {
        system.broadcastEvent(SendToMinecraftServer.ExecuteCommand, command);
    }

    const enum ChessComponents {
        ChessPiece = "chess:chess_piece",
        Marker = "chess:marker"
    }
    interface MarkerComponent {
        position: VectorXZ;
    }
    interface ChessPieceComponent {
        type: Piece;
        colour: PieceColour;
        forwardVectorZ: 1 | -1;
    }
}