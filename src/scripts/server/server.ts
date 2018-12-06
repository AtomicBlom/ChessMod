///<reference types="minecraft-scripting-types-server" />

import { GameInstance, PieceSet, PieceSetName, Piece, PieceColour, GameState, MarkerComponent, ChessComponents, ChessPieceComponent, MoveType, PossiblePieceMove, KingState, EntityNearPlayfield, GamePieceEntity, MarkerEntity } from '../chess';
import { ChessEvents, NotifyMouseCursor } from '../events';
import { PlayerLocation, VectorXZ, VectorXYZ } from '../maths';

namespace Server {
    const distanceBetweenGames: number = 32;
    const gameYLevel: number = 5;
    const MARKER_ENTITY: string = "minecraft:bat";

    const system = server.registerSystem(0, 0);

    const gameInstances: GameState[] = [];
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

    function getOppositeColour(colour: PieceColour): PieceColour {
        return colour === PieceColour.Black ? PieceColour.White : PieceColour.Black;
    }

    function findPieceById(gameState: GameState, id: number) {
        const locatedPieces = gameState.pieces.black.concat(gameState.pieces.white).filter(p => p.entity.id === id);
        if (locatedPieces.length == 0) return null;
        if (locatedPieces.length > 1) {
            system.broadcastEvent(SendToMinecraftServer.DisplayChat, "Apparently more than piece was matched by ID... how...?");
        }
        return locatedPieces[0];
    }

    function findMarkerById(gameState: GameState, id: number) {
        const locatedMarkers = gameState.markers.filter(p => p.entity.id === id);
        if (locatedMarkers.length == 0) return null;
        if (locatedMarkers.length > 1) {
            system.broadcastEvent(SendToMinecraftServer.DisplayChat, "Apparently more than marker was matched by ID... how...?");
        }
        return locatedMarkers[0];
    }

    function onPlayerAttack(eventData: IPlayerAttackedActorEventData) {
        const playerGames = gameInstances.filter(gb => gb.game.players.some(p => p.id === eventData.player.id));
        if (playerGames.length === 0) {
            system.broadcastEvent(SendToMinecraftServer.DisplayChat, `You are not in a game`);
            return;
        };

        const gameState = playerGames[0];
        const game = gameState.game;
        if (game.isComplete) {
            return;
        }

        const expectedPlayer = game.players[game.currentPlayerColour === PieceColour.White ? 0 : 1];
        if (expectedPlayer.id !== eventData.player.id) {
            system.broadcastEvent(SendToMinecraftServer.DisplayChat, `It is not your turn`);
            return;
        }

        const attackedPiece = findPieceById(gameState, eventData.attacked_entity.id);
        

        // const health = system.getComponent(eventData.attacked_entity, MinecraftComponent.Health);
        // health.health = health.maxHealth;
        // system.applyComponentChanges(health);

        //The user selected a game piece.
        if (!!attackedPiece) {
            const chessPiece = attackedPiece.piece;
            const boardPosition = attackedPiece.boardPosition;
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
                game.selectedPiece = attackedPiece;
                createMarkers(gameState, chessPiece, boardPosition);
            } else {
                //FIXME: allow castling
                //Player selected the same entity again, cancel the move.
                if (game.selectedPiece.entity.id === eventData.attacked_entity.id) {
                    game.selectedPiece = null;
                    removeMarkers(gameState);
                    system.broadcastEvent(SendToMinecraftServer.DisplayChat, `Cancelled move for ${chessPiece.type} at ${boardPosition.x},${boardPosition.z}`);
                    return;
                }
                //Attacking a piece
                if (chessPiece.colour === game.currentPlayerColour) {
                    system.broadcastEvent(SendToMinecraftServer.DisplayChat, `Cannot attack ${chessPiece.type} at ${boardPosition.x},${boardPosition.z} belongs to you`);
                    return;
                } else {
                    system.broadcastEvent(SendToMinecraftServer.DisplayChat, `Attacking ${chessPiece.colour} ${chessPiece.type} at ${boardPosition.x},${boardPosition.z}`);
                    if (attackPiece(gameState, attackedPiece)) {
                        updateTurn(gameState);
                    }
                }
            }
        } else if (!!game.selectedPiece) {
            //We're trying to identify what they want to do with the piece.
            const marker = findMarkerById(gameState, eventData.attacked_entity.id);
            if (!!marker) {
                const boardPosition = marker.boardPosition;
                if (!!boardPosition) {
                    system.broadcastEvent(SendToMinecraftServer.DisplayChat, `Moving piece to ${boardPosition.x},${boardPosition.z}`);
    
                    if (movePiece(gameState, game.selectedPiece, boardPosition)) {
                        updateTurn(gameState);
                    };
                }
            }
        }
        
    }

    function updateTurn(gameState: GameState) {
        removeMarkers(gameState);
        const game = gameState.game;
        game.selectedPiece = null;
        const previousPlayerColour = game.currentPlayerColour;
        game.currentPlayerColour = game.currentPlayerColour === PieceColour.Black ? PieceColour.White : PieceColour.Black;

        const pieces = gameState.pieces[game.currentPlayerColour].filter(p => p.piece.type === Piece.King);
        if (pieces.length !== 0) {
            //Should always be the case. don't allow players to actually kill the king.
            const king = pieces[0];

            const kingState = isKingInCheck(game, king.piece, king.boardPosition);
            if (kingState === KingState.CheckMate) {
                game.isComplete = true;
                system.broadcastEvent(SendToMinecraftServer.DisplayChat, `${previousPlayerColour} has won the game`);
                return;
            }
        }
        
        system.broadcastEvent(SendToMinecraftServer.DisplayChat, `It is now ${game.currentPlayerColour}'s turn`);
    }

    function movePiece(gameState: GameState, entity: GamePieceEntity, newBoardPosition: VectorXZ) {
        const move = getPieceMoves(gameState.game, entity.piece, entity.boardPosition)
                        .filter(move => move.x === newBoardPosition.x && move.z === newBoardPosition.z);

        //FIXME: Manage if user clicked on a marker that was actually an attack.
        if (move.length > 0 && move[0].type === MoveType.Empty) {
            const worldPositionComponent = system.getComponent(entity.entity, MinecraftComponent.Position);
            const worldPosition = getEntityWorldPosition(gameState.game, newBoardPosition.x, newBoardPosition.z);
            worldPositionComponent.x = worldPosition.x;
            worldPositionComponent.z = worldPosition.z;
            entity.boardPosition = newBoardPosition;
            system.applyComponentChanges(worldPositionComponent);

            //FIXME: if piece was a pawn, allow them to select a piece.
            return true;
        }
        return false;
    }

    function attackPiece(gameState: GameState, attackedEntity: GamePieceEntity) {
        const game = gameState.game;
        const selectedPiece = gameState.game.selectedPiece;
        const move = getPieceMoves(game, selectedPiece.piece, game.selectedPiece.boardPosition)
                        .filter(move => move.x === attackedEntity.boardPosition.x && move.z === attackedEntity.boardPosition.z);

        if (move.length > 0 && move[0].type === MoveType.Attack) {
            //Move the attacking piece
            const worldPositionComponent = system.getComponent(selectedPiece.entity, MinecraftComponent.Position);
            const worldPosition = getEntityWorldPosition(game, attackedEntity.boardPosition.x, attackedEntity.boardPosition.z);
            worldPositionComponent.x = worldPosition.x;
            worldPositionComponent.z = worldPosition.z;
            selectedPiece.boardPosition.x = attackedEntity.boardPosition.x;
            selectedPiece.boardPosition.z = attackedEntity.boardPosition.z;

            //FIXME: Rather than remove, move the piece off to the side.
            gameState.pieces[attackedEntity.piece.colour] = gameState.pieces[attackedEntity.piece.colour].filter(p => p.entity.id === attackedEntity.entity.id)
            system.destroyEntity(attackedEntity.entity);

            system.applyComponentChanges(worldPositionComponent);
            return true;
        }
        return false;

    }

    function getBoardPosition(game: GameInstance, worldX: number, worldZ: number) {
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

    function getWorldPosition(game: GameInstance, boardX: number, boardZ: number) {
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

    function getEntityWorldPosition(game: GameInstance, boardX: number, boardZ: number) {
        var worldPosition = getWorldPosition(game, boardX, boardZ);
        if (!worldPosition) return null;

        const entityPosition: VectorXYZ = {
            x: worldPosition.x + 1,
            y: gameYLevel + 1,
            z: worldPosition.z + 1
        }
        return entityPosition;
    }

    function createMarkers(gameState: GameState, piece: ChessPieceComponent, boardPosition: VectorXZ) {
        for (const move of getPieceMoves(gameState.game, piece, boardPosition)) {
            createMarker(gameState, move);
        }
    }

    function getPieceMoves(game: GameInstance, piece: ChessPieceComponent, boardPosition: VectorXZ): PossiblePieceMove[] {
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

    function checkCanMove(game: GameInstance, x: number, z: number, canAttack: boolean, addItem: (possiblePieceMove: PossiblePieceMove) => void): boolean {
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

    function createPawnMarkers(game: GameInstance, boardPosition: VectorXZ, forwardVectorZ: number): PossiblePieceMove[] {
        const moves: PossiblePieceMove[] = [];
        let canPlace = true;

        canPlace = canPlace && checkCanMove(game, boardPosition.x, boardPosition.z + 1 * forwardVectorZ, false, move => moves.push(move));
        canPlace = canPlace && checkCanMove(game, boardPosition.x, boardPosition.z + 2 * forwardVectorZ, false, move => moves.push(move));

        //Only add these moves if it is a valid attack target.
        checkCanMove(game, boardPosition.x + 1, boardPosition.z + 1 * forwardVectorZ, true, move => move.type === MoveType.Attack && moves.push(move))
        checkCanMove(game, boardPosition.x - 1, boardPosition.z + 1 * forwardVectorZ, true, move => move.type === MoveType.Attack && moves.push(move))
        return moves;
    }

    function createBishopMarkers(game: GameInstance, boardPosition: VectorXZ): PossiblePieceMove[] {
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

    function createRookMarkers(game: GameInstance, boardPosition: VectorXZ): PossiblePieceMove[] {
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

    function createQueenMarkers(game: GameInstance, boardPosition: VectorXZ): PossiblePieceMove[] {
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

    function createKingMarkers(game: GameInstance, boardPosition: VectorXZ): PossiblePieceMove[] {
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

    function isKingInCheck(game: GameInstance, kingPiece: ChessPieceComponent, atPosition: VectorXZ): KingState {
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

    function createKnightMarkers(game: GameInstance, boardPosition: VectorXZ): PossiblePieceMove[] {
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

    function removeMarkers(game: GameState) {
        for (const marker of game.markers) {
            system.destroyEntity(marker.entity);
        }
        game.markers.length = 0;
    }

    function getPieceAtBoardLocation(game: GameInstance, x: number, z: number) {
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

    function createMarker(gameState: GameState, move: PossiblePieceMove): boolean {
        const worldPosition = getEntityWorldPosition(gameState.game, move.x, move.z);

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

        gameState.markers.push({
            entity: entity,
            type: "marker",
            boardPosition: marker.position,
            //worldPosition: position
        })

        return true;
    }

    function onNotifyMouseCursor(eventData: NotifyMouseCursor) {
        const gameState = gameInstances[eventData.gameId];
        if (!gameState) return;
        const game = gameState.game;


        let highlightedBlock = game.highlightedBlock
        
        const boardPosition = getBoardPosition(game, eventData.x, eventData.z);
                
        if (!!highlightedBlock) {
            if (!!boardPosition && (highlightedBlock.x == boardPosition.x && highlightedBlock.z == boardPosition.z)) return;

            const block = getBlockType(highlightedBlock);
            const worldPosition = getWorldPosition(game, highlightedBlock.x, highlightedBlock.z)
            const command = `/fill ${worldPosition.x} ${gameYLevel} ${worldPosition.z} ${worldPosition.x + 1} ${gameYLevel} ${worldPosition.z + 1} ${block}`;
            executeCommand(command);
        }

        if (!!boardPosition) {
            const worldPosition = getWorldPosition(game, boardPosition.x, boardPosition.z)
            
            const command = `/fill ${worldPosition.x} ${gameYLevel} ${worldPosition.z} ${worldPosition.x + 1} ${gameYLevel} ${worldPosition.z + 1} diamond_block`;
            executeCommand(command);
        }
        game.highlightedBlock = boardPosition;
    }

    function getBlockType(boardPosition: VectorXZ) {
        const blockType = !!((boardPosition.x % 2) ^ (boardPosition.z % 2));
        const block = blockType ? 'concrete 15' : 'concrete 0';
        return block;
    }

    function onJoinNewGame(player: IEntityObject) {
        const game = findNewGame().game;
        
        game.players.push(player);

        setPlayerNumber(player, game.players.length, game);
        
        if (game.players.length == 2) {
            system.broadcastEvent(ChessEvents.GameStarting, game);
        }
    }

    function setPlayerNumber(player: IEntityObject, playerNumber: number, game: GameInstance) {
        const playerName = system.getComponent(player, MinecraftComponent.Nameable);
        const playerLocation: PlayerLocation = playerNumber == 1 ? {x: 7, y: 4, z: -2, rotation: 0} : {x: 7, y: 4, z: 18, rotation: 180}
        const movePlayerCommand = `/tp ${playerName.name} ${game.location.x * 32 + playerLocation.x} ${gameYLevel + playerLocation.y} ${game.location.z * 32 + playerLocation.z} ${playerLocation.rotation} 40`;
        executeCommand(movePlayerCommand);
        system.broadcastEvent(ChessEvents.SetPlayerNumber, {player: player, number: playerNumber});
    }

    function findNewGame() {
        let waitingGameBoard: GameState = null;
        let furthestExaminedLocation: VectorXZ = {x: -1, z: 0};
        
        for (const gameState of gameInstances) {
            const game = gameState.game;
            furthestExaminedLocation = game.location;
            if (game.players.length < 2 && !game.hasStarted) {
                waitingGameBoard = gameState;
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

    function getGameEntities(game: GameInstance) {
        const {x: startX, z: startZ} = getWorldPosition(game, 0, 0);
        const entities = system.getEntitiesFromSpatialView(spatialView, startX - 8, 0, startZ, startX + 16 + 8, 16, startZ + 16 + 8);
        return entities.filter(entity => 
            !!system.getComponent(entity, ChessComponents.ChessPiece) ||
            !!system.getComponent(entity, ChessComponents.Marker)
        );
    }

    function getGameState(game: GameInstance): GameState {
        const gameState: GameState = {
            game: game,
            markers: [],
            pieces: {
                white: [],
                black: []
            },
            otherEntities: []
        };

        const {x: startX, z: startZ} = getWorldPosition(game, 0, 0);
        system.getEntitiesFromSpatialView(spatialView, startX - 8, 0, startZ, startX + 16 + 8, 16, startZ + 16 + 8)
            .forEach(entity => {
                const position = system.getComponent(entity, MinecraftComponent.Position);
                const playfieldEntity: EntityNearPlayfield = {
                    entity: entity,
                    type: "other",
                    //worldPosition: position,
                    boardPosition: getBoardPosition(game, position.x, position.z)
                }
                if (entity.__identifier__ === "minecraft:player") {
                    return;
                } else {
                    const piece = system.getComponent<ChessPieceComponent>(entity, ChessComponents.ChessPiece);
                    if (!!piece) {
                        const gamePieceEntity = <GamePieceEntity>playfieldEntity;
                        playfieldEntity.type = "piece"
                        gamePieceEntity.piece = piece;
                        gameState.pieces[piece.colour].push(gamePieceEntity);
                        return;
                    } else {
                        const marker = system.getComponent<MarkerComponent>(entity, ChessComponents.Marker);
                        if (!!marker) {
                            playfieldEntity.type = "marker";
                            gameState.markers.push(<MarkerEntity>playfieldEntity);
                            return;
                        }
                    }
                }

                gameState.otherEntities.push(playfieldEntity);
            });

        return <GameState>gameState;
        
    }

    function createGame(location: VectorXZ): GameState {
        const gameBoard: GameInstance = {
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

        const state = getGameState(gameBoard);

        for (const entity of state.otherEntities) {
            system.destroyEntity(entity.entity);
        }
        state.otherEntities.length = 0;

        createPieceSet(state, PieceColour.Black, pieceSets[0]);
        createPieceSet(state, PieceColour.White, pieceSets[0]);

        return state;
    }

    function createPieceSet(gameState: GameState, player: PieceColour, pieceSet: PieceSet) {

        const frontRow = player === PieceColour.Black ? 6 : 1;
        const rearRow = player === PieceColour.Black ? 7 : 0;

        spawnPiece(gameState, pieceSet, Piece.Rook  , player, 0, rearRow);
        spawnPiece(gameState, pieceSet, Piece.Knight, player, 1, rearRow);
        spawnPiece(gameState, pieceSet, Piece.Bishop, player, 2, rearRow);
        spawnPiece(gameState, pieceSet, Piece.King  , player, 3, rearRow);
        spawnPiece(gameState, pieceSet, Piece.Queen , player, 4, rearRow);
        spawnPiece(gameState, pieceSet, Piece.Bishop, player, 5, rearRow);
        spawnPiece(gameState, pieceSet, Piece.Knight, player, 6, rearRow);
        spawnPiece(gameState, pieceSet, Piece.Rook  , player, 7, rearRow);
        for (let i = 0; i < 8; ++i) {
            spawnPiece(gameState, pieceSet, Piece.Pawn, player, i, frontRow);
        }
    }

    function spawnPiece(gameState: GameState, pieceSet: PieceSet, piece: Piece, colour: PieceColour, x: number, z: number) {
        const entity = system.createEntity(EntityType.Entity, pieceSet.pieces[piece]);
        const chessPiece = system.createComponent<ChessPieceComponent>(entity, ChessComponents.ChessPiece)
        const position = system.getComponent(entity, MinecraftComponent.Position);
        const rotation = system.getComponent(entity, MinecraftComponent.Rotation);

        const worldPosition = getEntityWorldPosition(gameState.game, x, z);

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
        
        gameState.pieces[colour].push({
            entity: entity,
            boardPosition: {
                x: x,
                z: z,
            },
            piece: chessPiece,
            type: "piece",
            //worldPosition: worldPosition
        })
    }

    function executeCommand(command: string) {
        system.broadcastEvent(SendToMinecraftServer.ExecuteCommand, command);
    }
}
