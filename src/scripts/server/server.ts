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
                knight: "minecraft:creeper", //FIXME: Change to illager beast
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
        if (playerGames.length === 0) {
            system.broadcastEvent(SendToMinecraftServer.DisplayChat, `You are not in a game`);
            return;
        };

        const game = playerGames[0];
        if (game.isComplete) {
            return;
        }

        const expectedPlayer = game.players[game.currentPlayerColour === PieceColour.White ? 0 : 1];
        if (expectedPlayer.id !== eventData.player.id) {
            system.broadcastEvent(SendToMinecraftServer.DisplayChat, `It is not your turn`);
            return;
        }

        const health = system.getComponent(eventData.attacked_entity, MinecraftComponent.Health);
        health.health = health.maxHealth;
        system.applyComponentChanges(health);

        const chessPiece = system.getComponent<ChessPieceComponent>(eventData.attacked_entity, ChessComponents.ChessPiece);
        if (!!chessPiece) {
            const position = system.getComponent(eventData.attacked_entity, MinecraftComponent.Position);
            const boardPosition = getBoardPosition(game, position.x, position.z);
            if (!boardPosition) return;

            if (!game.selectedPiece) {
                //FIXME: Ensure that if king is in check that the piece has a move that would fix the check state.
                //Selecting a game piece.
                if (chessPiece.colour !== game.currentPlayerColour) {
                    system.broadcastEvent(SendToMinecraftServer.DisplayChat, `Cannot select ${chessPiece.type} at ${boardPosition.x},${boardPosition.z} belongs to ${chessPiece.colour}`);
                    return;
                };
                if (getPieceMoves(game, chessPiece, boardPosition).length === 0) {
                    system.broadcastEvent(SendToMinecraftServer.DisplayChat, `Cannot select ${chessPiece.type} at ${boardPosition.x},${boardPosition.z} there are no moves available`);
                    return;
                };
                system.broadcastEvent(SendToMinecraftServer.DisplayChat, `Selected ${chessPiece.colour} ${chessPiece.type} at ${boardPosition.x},${boardPosition.z}`);
                game.selectedPiece = eventData.attacked_entity;
                createMarkers(game, chessPiece, boardPosition);
            } else {
                //FIXME: allow castling
                if (game.selectedPiece.id === eventData.attacked_entity.id) {
                    game.selectedPiece = null;
                    removeMarkers(game);
                    system.broadcastEvent(SendToMinecraftServer.DisplayChat, `Cancelled move for ${chessPiece.type} at ${boardPosition.x},${boardPosition.z}`);
                    return;
                }
                //Attacking a piece
                if (chessPiece.colour === game.currentPlayerColour) {
                    system.broadcastEvent(SendToMinecraftServer.DisplayChat, `Cannot attack ${chessPiece.type} at ${boardPosition.x},${boardPosition.z} belongs to you`);
                    return;
                } else {
                    system.broadcastEvent(SendToMinecraftServer.DisplayChat, `Attacking ${chessPiece.colour} ${chessPiece.type} at ${boardPosition.x},${boardPosition.z}`);
                    if (attackPiece(game, eventData.attacked_entity)) {
                        updateTurn(game);
                    }
                }
            }
        } else if (!!game.selectedPiece && !!system.getComponent(eventData.attacked_entity, ChessComponents.Marker)) {
            const position = system.getComponent(eventData.attacked_entity, MinecraftComponent.Position);
            const boardPosition = getBoardPosition(game, position.x, position.z);
            if (!!boardPosition) {
                system.broadcastEvent(SendToMinecraftServer.DisplayChat, `Moving piece to ${boardPosition.x},${boardPosition.z}`);

                if (movePiece(game, game.selectedPiece, boardPosition)) {
                    updateTurn(game);
                };
            }
        }
    }

    function updateTurn(game: GameBoard) {
        removeMarkers(game);
        game.selectedPiece = null;
        const previousPlayerColour = game.currentPlayerColour;
        game.currentPlayerColour = game.currentPlayerColour === PieceColour.Black ? PieceColour.White : PieceColour.Black;

        const pieces = findPieces(game, game.currentPlayerColour, Piece.King);
        if (pieces.length !== 0) {
            //Should always be the case. don't allow players to actually kill the king.
            const king = pieces[0];
            const kingPieceComponent = system.getComponent<ChessPieceComponent>(king, ChessComponents.ChessPiece);
            const kingPiecePosition = system.getComponent(king, MinecraftComponent.Position);
            const kingBoardPosition = getBoardPosition(game, kingPiecePosition.x, kingPiecePosition.z);

            const kingState = isKingInCheck(game, kingPieceComponent, kingBoardPosition);
            if (kingState === KingState.CheckMate) {
                game.isComplete = true;
                system.broadcastEvent(SendToMinecraftServer.DisplayChat, `${previousPlayerColour} has won the game`);
                return;
            }
        }
        
        system.broadcastEvent(SendToMinecraftServer.DisplayChat, `It is now ${game.currentPlayerColour}'s turn`);
    }

    function movePiece(game: GameBoard, entity: IEntityObject, boardPosition: VectorXZ) {
        const worldPosition = getEntityWorldPosition(game, boardPosition.x, boardPosition.z);

        const selectedPiece = system.getComponent<ChessPieceComponent>(game.selectedPiece, ChessComponents.ChessPiece);
        const selectedPiecePositionComponent = system.getComponent(game.selectedPiece, MinecraftComponent.Position);
        const selectedPieceBoardPosition = getBoardPosition(game, selectedPiecePositionComponent.x, selectedPiecePositionComponent.z);
        const move = getPieceMoves(game, selectedPiece, selectedPieceBoardPosition)
                        .filter(move => move.x === boardPosition.x && move.z === boardPosition.z);

        //FIXME: Manage if user clicked on a marker that was actually an attack.
        if (move.length > 0 && move[0].type === MoveType.Empty) {
            const position = system.getComponent(entity, MinecraftComponent.Position);
            position.x = worldPosition.x;
            position.z = worldPosition.z;
            system.applyComponentChanges(position);

            //FIXME: if piece was a pawn, allow them to select a piece.
            return true;
        }
        return false;
    }

    function attackPiece(game: GameBoard, attackedEntity: IEntityObject) {
        const attackedPiecePosition = system.getComponent(attackedEntity, MinecraftComponent.Position);
        const attackBoardPosition = getBoardPosition(game, attackedPiecePosition.x, attackedPiecePosition.z);

        const selectedPiece = system.getComponent<ChessPieceComponent>(game.selectedPiece, ChessComponents.ChessPiece);
        const selectedPiecePositionComponent = system.getComponent(game.selectedPiece, MinecraftComponent.Position);
        const selectedPieceBoardPosition = getBoardPosition(game, selectedPiecePositionComponent.x, selectedPiecePositionComponent.z);
        const move = getPieceMoves(game, selectedPiece, selectedPieceBoardPosition)
                        .filter(move => move.x === attackBoardPosition.x && move.z === attackBoardPosition.z);

        if (move.length > 0 && move[0].type === MoveType.Attack) {
            //FIXME: Rather than remove, move the piece off to the side.
            system.destroyEntity(attackedEntity);

            //Move the attacking piece
            const worldPosition = getEntityWorldPosition(game, attackBoardPosition.x, attackBoardPosition.z);
            const position = system.getComponent(game.selectedPiece, MinecraftComponent.Position);
            position.x = worldPosition.x;
            position.z = worldPosition.z;
            system.applyComponentChanges(position);
            return true;
        }
        return false;

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
        for (const move of getPieceMoves(game, piece, boardPosition)) {
            createMarker(game, move);
        }
    }

    function getPieceMoves(game: GameBoard, piece: ChessPieceComponent, boardPosition: VectorXZ): PossiblePieceMove[] {
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
        return [];
    }

    interface PossiblePieceMove {
        x: number,
        z: number,
        type: MoveType,
    }

    const enum MoveType {
        Blocked = 'blocked',
        Attack = 'attack',
        Empty = 'empty'
    }

    function checkCanMove(game: GameBoard, x: number, z: number, canAttack: boolean, addItem: (possiblePieceMove: PossiblePieceMove) => void): boolean {
        if (x < 0 || x >= 8) return false;
        if (z < 0 || z >= 8) return false;

        const piece = getPieceAtBoardLocation(game, x, z);
        let result = MoveType.Empty;
        if (!!piece) {
            if (canAttack && piece.colour !== game.currentPlayerColour) {
                result = MoveType.Attack;
            } else {
                return false;
            }
        }

        addItem(<PossiblePieceMove>{
            x: x,
            z: z,
            type: result
        })
        return true;
    }

    function createPawnMarkers(game: GameBoard, boardPosition: VectorXZ, forwardVectorZ: number): PossiblePieceMove[] {
        const moves: PossiblePieceMove[] = [];
        let canPlace = true;

        canPlace = canPlace && checkCanMove(game, boardPosition.x, boardPosition.z + 1 * forwardVectorZ, false, move => moves.push(move));
        canPlace = canPlace && checkCanMove(game, boardPosition.x, boardPosition.z + 2 * forwardVectorZ, false, move => moves.push(move));

        //Only add these moves if it is a valid attack target.
        checkCanMove(game, boardPosition.x + 1, boardPosition.z + 1 * forwardVectorZ, true, move => move.type === MoveType.Attack && moves.push(move))
        checkCanMove(game, boardPosition.x - 1, boardPosition.z + 1 * forwardVectorZ, true, move => move.type === MoveType.Attack && moves.push(move))
        return moves;
    }

    function createBishopMarkers(game: GameBoard, boardPosition: VectorXZ): PossiblePieceMove[] {
        const moves: PossiblePieceMove[] = [];
        const directions :VectorXZ[] = [{x: 1, z: 1}, {x: -1, z: 1}, {x: 1, z: -1}, {x: -1, z: -1}];

        for (const direction of directions) {
            let position: VectorXZ = {x: boardPosition.x, z: boardPosition.z};
            let canPlace = true;
            while (canPlace) {
                position.x += direction.x;
                position.z += direction.z;
                canPlace = checkCanMove(game, position.x, position.z, true, move => moves.push(move));
            }
        }
        return moves;
    }

    function createRookMarkers(game: GameBoard, boardPosition: VectorXZ): PossiblePieceMove[] {
        const moves: PossiblePieceMove[] = [];
        const directions :VectorXZ[] = [{x: 1, z: 0}, {x: -1, z: 0}, {x: 0, z: -1}, {x: 0, z: 1}];
        
        for (const direction of directions) {
            let x = boardPosition.x;
            let z = boardPosition.z;
            let canPlace = true;
            while (canPlace) {
                x += direction.x;
                z += direction.z;
                canPlace = checkCanMove(game, x, z, true, move => moves.push(move));
            }
        }
        return moves;
    }

    function createQueenMarkers(game: GameBoard, boardPosition: VectorXZ): PossiblePieceMove[] {
        const moves: PossiblePieceMove[] = [];
        const directions :VectorXZ[] = [
            {x: 1, z: 0}, {x: -1, z: 0}, {x: 0, z: -1}, {x: 0, z: 1},
            {x: 1, z: 1}, {x: -1, z: 1}, {x: 1, z: -1}, {x: -1, z: -1}
        ];
        
        for (const direction of directions) {
            let x = boardPosition.x;
            let z = boardPosition.z;
            let canPlace = true;
            while (canPlace) {
                x += direction.x;
                z += direction.z;
                canPlace = checkCanMove(game, x, z, true, move => moves.push(move));
            }
        }
        return moves;
    }

    function createKingMarkers(game: GameBoard, boardPosition: VectorXZ): PossiblePieceMove[] {
        const moves: PossiblePieceMove[] = [];
        const directions :VectorXZ[] = [
            {x: 1, z: 0}, {x: -1, z: 0}, {x: 0, z: -1}, {x: 0, z: 1},
            {x: 1, z: 1}, {x: -1, z: 1}, {x: 1, z: -1}, {x: -1, z: -1}
        ];
        
        for (const direction of directions) {
            const x = boardPosition.x + direction.x;
            const z = boardPosition.z + direction.z;
            //FIXME: verify move would not cause a check/checkmate.
            checkCanMove(game, x, z, true, move => moves.push(move));
        }
        return moves;
    }

    const enum KingState {
        Safe,
        Check,
        CheckMate,
        Trapped
    }

    function isKingInCheck(game: GameBoard, kingPiece: ChessPieceComponent, atPosition: VectorXZ): KingState {
        const possibleEnemyMoves: PossiblePieceMove[] = [];
        for (const entity of getGameEntities(game)) {
            const pieceComponent = system.getComponent<ChessPieceComponent>(entity, ChessComponents.ChessPiece);
            if (!pieceComponent || pieceComponent.colour === kingPiece.colour) continue;

            const position = system.getComponent(entity, MinecraftComponent.Position);
            const gameBoardPosition = getBoardPosition(game, position.x, position.z);
            possibleEnemyMoves.push(...getPieceMoves(game, pieceComponent, gameBoardPosition));
        }

        const availableKingMoves = getPieceMoves(game, kingPiece, atPosition);
        const isCheck = possibleEnemyMoves.some(enemyMove => enemyMove.x === atPosition.x && enemyMove.z === atPosition.z);
        const canKingMove = availableKingMoves.filter(kingMove => !possibleEnemyMoves.some(enemyMove => enemyMove.x === kingMove.x && enemyMove.z === kingMove.z));
        //FIXME: verify that an attack by the king wouldn't result in the king being in check.

        if (isCheck) {
            if (!canKingMove) {
                return KingState.CheckMate;
            } else {
                return KingState.Check;
            }
        } else {
            if (canKingMove) {
                return KingState.Safe;
            } else {
                return KingState.Trapped;
            }
        }
    }

    function createKnightMarkers(game: GameBoard, boardPosition: VectorXZ): PossiblePieceMove[] {
        const moves: PossiblePieceMove[] = [];
        const directions :VectorXZ[] = [
            {x: -1, z: -2}, {x: 1, z: -2}, {x: -2, z: -1}, {x: 2, z: -1},
            {x: -2, z: 1}, {x: 2, z: 1}, {x: -1, z: 2}, {x: 1, z: 2}
        ];
        
        for (const direction of directions) {
            const x = boardPosition.x + direction.x;
            const z = boardPosition.z + direction.z;
            checkCanMove(game, x, z, true, move => moves.push(move));
        }
        return moves;
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

    function createMarker(game: GameBoard, move: PossiblePieceMove): boolean {
        const worldPosition = getEntityWorldPosition(game, move.x, move.z);

        const entity = system.createEntity(EntityType.Entity, MARKER_ENTITY);
        const position = system.getComponent(entity, MinecraftComponent.Position);
        const rotation = system.getComponent(entity, MinecraftComponent.Rotation);
        const marker = system.createComponent<MarkerComponent>(entity, ChessComponents.Marker);
     
        position.x = worldPosition.x;
        position.y = gameYLevel + 1;
        if (move.type === MoveType.Attack) {
            position.y += 2;
        }
        position.z = worldPosition.z;
        marker.position = {
            x: move.x,
            z: move.z
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

    function getGameEntities(game: GameBoard) {
        const {x: startX, z: startZ} = getWorldPosition(game, 0, 0);
        const entities = system.getEntitiesFromSpatialView(spatialView, startX - 8, 0, startZ, startX + 16 + 8, 16, startZ + 16 + 8);
        return entities.filter(entity => 
            !!system.getComponent(entity, ChessComponents.ChessPiece) ||
            !!system.getComponent(entity, ChessComponents.Marker)
        );
    }

    function getEntitiesOnGameBoard(game: GameBoard) {
        const {x: startX, z: startZ} = getWorldPosition(game, 0, 0);
        const entities = system.getEntitiesFromSpatialView(spatialView, startX - 8, 0, startZ, startX + 16 + 8, 16, startZ + 16 + 8);
        return entities.filter(entity => entity.__identifier__ !== "minecraft:player");
    }

    function findPieces(game: GameBoard, colour: PieceColour, piece: Piece) {
        const {x: startX, z: startZ} = getWorldPosition(game, 0, 0);
        const entities = system.getEntitiesFromSpatialView(spatialView, startX - 8, 0, startZ, startX + 16 + 8, 16, startZ + 16 + 8);
        return entities.filter(entity => {
            const pieceComponent = system.getComponent<ChessPieceComponent>(entity, ChessComponents.ChessPiece);
            return !!pieceComponent && pieceComponent.colour === colour && pieceComponent.type == piece;
        });
    }

    function createGameBoard(location: VectorXZ) {
        
        const gameBoard: GameBoard = {
            hasStarted: false,
            location: location, 
            players: [
                
            ],
            highlightedBlock: null,
            selectedPiece: null,
            currentPlayerColour: PieceColour.White,
            isComplete: false
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

        //FIXME: Split up White and black to allow switching sets
        const playerAPieceSet = pieceSets.filter(ps => ps.name === PieceSetName.Overworld)[0];
        const playerBPieceSet = pieceSets.filter(ps => ps.name === PieceSetName.Overworld)[0];

        for (const entity of getEntitiesOnGameBoard(gameBoard)) {
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