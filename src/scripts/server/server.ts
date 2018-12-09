/// <reference types="minecraft-scripting-types-server" />

import { PieceSet, PieceSetName, Piece, PieceColour, MarkerComponent, ChessComponents, ChessPieceComponent, MoveType, PossiblePieceMove, KingState, EntityNearPlayfield, GamePieceEntity, MarkerEntity, GameInstance } from '../chess';
import { ChessEvents, NotifyMouseCursor } from '../events';
import { PlayerLocation, VectorXZ } from '../maths';

namespace Server {
    const distanceBetweenGames: number = 32;
    const gameYLevel: number = 5;

    const system = server.registerSystem(0, 0);

    const gameInstances: GameManager[] = [];

    let positionQuery: IQuery;

    // Setup which events to listen for
    system.initialize = function () {
        system.listenForEvent(ChessEvents.JoinNewGame, onJoinNewGame);
        system.listenForEvent(ChessEvents.NotifyMouseCursor, onNotifyMouseCursor);
        system.listenForEvent(ReceiveFromMinecraftServer.PlayerAttackedActor, onPlayerAttack);

        positionQuery = system.registerQuery(MinecraftComponent.Position);

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

    function onJoinNewGame(player: IEntityObject) {
        const game = findNewGame();
        const playerCount = game.addPlayer(player);
                
        if (playerCount == 2) {
            game.start();
        }
    }

    function findNewGame() {
        let waitingGameBoard: GameManager = null;
        let furthestExaminedLocation: VectorXZ = {x: -1, z: 0};
        
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
        const gameManager = new GameManager(game);
        const gameWorldLocation = game.getWorldPosition(0, 0);
        system.broadcastEvent(SendToMinecraftServer.DisplayChat, `Creating new gameboard at ${gameWorldLocation.x}, ${gameWorldLocation.z}`);
        gameManager.initialize();
        return gameManager;
    }

    function executeCommand(command: string) {
        system.broadcastEvent(SendToMinecraftServer.ExecuteCommand, command);
    }

    class GameManager {
        _boardGenerator: BoardGenerator;
        _moveManager: MoveManager;
        _markerManager: MarkerManager;

        highlightedBlock: VectorXZ = null;

        get hasStarted() {
            return this._game.hasStarted;
        };
        get location(): VectorXZ {
            return this._game.location;
        }

        constructor(private _game: GameState) {
            this._boardGenerator = new BoardGenerator(_game);
            this._moveManager = new MoveManager(_game);
            this._markerManager = new MarkerManager(_game);
        }

        initialize() {
            this._boardGenerator.createBoard();
            this._boardGenerator.createPieceSet(PieceColour.Black, PieceSetName.Overworld);
            this._boardGenerator.createPieceSet(PieceColour.White, PieceSetName.Overworld);
            this._game.initialize();
        }

        start() {
            //FIXME:? Technically there's no reason to update the moves here, the set of starting moves is always well defined.
            //Force update all the available moves
            for (let piece of this._game.allPieces) {
                this._moveManager.updatePieceMoves(piece);
            }

            const startEvent: GameInstance = {
                players: this._game.players,
                location: this._game.location,
                worldLocation: this._game.worldLocation
            }

            system.broadcastEvent(ChessEvents.GameStarting, startEvent);
            this._game.hasStarted = true;
        }

        hasPlayer(id: number) {
            return this._game.players.some(p => p.id === id)
        }

        setPlayerNumber(player: IEntityObject, playerNumber: number) {
            const worldLocation = this._game.worldLocation;
            const playerName = system.getComponent(player, MinecraftComponent.Nameable);
            const playerLocation: PlayerLocation = playerNumber == 1 ? {x: 7, y: 4, z: -2, rotation: 0} : {x: 7, y: 4, z: 18, rotation: 180}
            const movePlayerCommand = `/tp ${playerName.name} ${worldLocation.x + playerLocation.x + 0.5} ${gameYLevel + playerLocation.y} ${worldLocation.z + playerLocation.z} ${playerLocation.rotation} 40`;
            executeCommand(movePlayerCommand);
            system.broadcastEvent(ChessEvents.SetPlayerNumber, {player: player, number: playerNumber});
        }

        processPlayerSelect(player: IEntityObject, attackedEntity: IEntityObject) {
            if (this._game.isComplete) {
                return;
            }

            const expectedPlayer = this._game.players[this._game.currentPlayerColour === PieceColour.White ? 0 : 1];
            if (expectedPlayer.id !== player.id) {
                system.broadcastEvent(SendToMinecraftServer.DisplayChat, `It is not your turn`);
                return;
            }

            const attackedPiece = this._game.findPieceById(attackedEntity.id);

            //The user selected a game piece.
            if (!!attackedPiece) {
                const chessPiece = attackedPiece.piece;
                const boardPosition = attackedPiece.boardPosition;
                if (!boardPosition) return;

                if (!this._game.selectedPiece) {
                    //FIXME: Ensure that if king is in check that the piece has a move that would fix the check state.
                    //Selecting a game piece.
                    //First, ensure that the selected chess piece is for the correct player
                    if (chessPiece.colour !== this._game.currentPlayerColour) {
                        system.broadcastEvent(SendToMinecraftServer.DisplayChat, `Cannot select ${chessPiece.type} at ${boardPosition.x},${boardPosition.z} belongs to ${chessPiece.colour}`);
                        return;
                    };
                    //Now let's make sure that the piece can actually do something.
                    if (attackedPiece.availableMoves.length === 0) {
                        system.broadcastEvent(SendToMinecraftServer.DisplayChat, `Cannot select ${chessPiece.type} at ${boardPosition.x},${boardPosition.z} there are no moves available`);
                        return;
                    };
                    //If we got this far, we have an entity we can select, so let's start tracking it
                    system.broadcastEvent(SendToMinecraftServer.DisplayChat, `Selected ${chessPiece.colour} ${chessPiece.type} at ${boardPosition.x},${boardPosition.z}`);
                    this._game.selectedPiece = attackedPiece;
                    //Create visual indicators of where they can move.
                    this._markerManager.createMarkers(this._game.selectedPiece);
                } else {
                    const selectedPiece = this._game.selectedPiece;
                    //If the player selected the same entity again, cancel the move.
                    if (selectedPiece.entity.id === attackedEntity.id) {
                        //Deselect the piece
                        this._game.selectedPiece = null;
                        //Clear any shown markers
                        this._markerManager.removeMarkers();
                        system.broadcastEvent(SendToMinecraftServer.DisplayChat, `Cancelled move for ${chessPiece.type} at ${boardPosition.x},${boardPosition.z}`);
                        return;
                    }

                    //The player has chosen to attacking a piece
                    //First make sure they're not attacking their own piece.
                    //FIXME: This is where we would need something special in here to allow castling
                    if (chessPiece.colour === this._game.currentPlayerColour) {
                        system.broadcastEvent(SendToMinecraftServer.DisplayChat, `Cannot attack ${chessPiece.type} at ${boardPosition.x},${boardPosition.z} belongs to you`);
                        return;
                    } 

                    //Checks passed? Ok, let's attack!
                    system.broadcastEvent(SendToMinecraftServer.DisplayChat, `Attacking ${chessPiece.colour} ${chessPiece.type} at ${boardPosition.x},${boardPosition.z}`);
                    const originalPosition = {
                        x: selectedPiece.boardPosition.x,
                        z: selectedPiece.boardPosition.z
                    }
                    if (this._moveManager.attackPiece(selectedPiece, attackedPiece)) {
                        //After the attack was successful, we need to refresh any pieces affected by the before and after locations of the selected piece.
                        this._moveManager.updateAvailableMoves(originalPosition, boardPosition);
                        this._moveManager.updatePieceMoves(selectedPiece);

                        //Good, now switch players
                        this.updateTurn();
                    }
                
                }
            //Ok, so it's not a game piece that was selected, so now we only want to do further checks
            //if they have a piece selected, otherwise it's not a valid thing to do.
            } else if (!!this._game.selectedPiece) {
                //Check if it's a move marker they've selected.
                const marker = this._markerManager.findMarkerById(attackedEntity.id);
                if (!!marker) {
                    const boardPosition = marker.boardPosition;
                    system.broadcastEvent(SendToMinecraftServer.DisplayChat, `Moving piece to ${boardPosition.x},${boardPosition.z}`);

                    //Move the selected piece to the marker's location
                    if (this._moveManager.movePiece(this._game.selectedPiece, boardPosition)) {
                        //After a successful move, we need to refresh any pieces affected by the before and after locations of the selected piece.
                        this._moveManager.updateAvailableMoves(this._game.selectedPiece.boardPosition, boardPosition)

                        //Now switch players.
                        this.updateTurn();
                    };
                }
            }
        }

        highlightBlock(worldX: number, worldZ: number) {
            const newHighlightBlockPosition = this._game.getBoardPosition(worldX, worldZ);
            this._boardGenerator.updateHighlightedBlock(this.highlightedBlock, newHighlightBlockPosition);
            this.highlightedBlock = newHighlightBlockPosition;
        }

        updateTurn() {
            this._markerManager.removeMarkers();
            this._game.selectedPiece = null;
            const previousPlayerColour = this._game.currentPlayerColour;
            this._game.currentPlayerColour = previousPlayerColour === PieceColour.Black ? PieceColour.White : PieceColour.Black;
    
            const pieces = this._game.findPiecesByType(previousPlayerColour, Piece.King);
            if (pieces.length !== 0) {
                //Should always be the case. don't allow players to actually kill the king.
                const king = pieces[0];
    
                const kingState = this._moveManager.isKingInCheck(king, king.boardPosition);
                if (kingState === KingState.CheckMate) {
                    this._game.isComplete = true;
                    system.broadcastEvent(SendToMinecraftServer.DisplayChat, `${previousPlayerColour} has won the game`);
                    return;
                }
            }
            
            system.broadcastEvent(SendToMinecraftServer.DisplayChat, `It is now ${this._game.currentPlayerColour}'s turn`);
        }

        addPlayer(player: IEntityObject) {
            this._game.players.push(player);

            this.setPlayerNumber(player, this._game.players.length);
            return this._game.players.length
        }
    }

    const MARKER_ENTITY: string = "minecraft:bat";
    class MarkerManager {
        markers: MarkerEntity[] = [];

        constructor(private _game: GameState) {
        }

        findMarkerById(id: number) {
            const locatedMarkers = this.markers.filter(p => p.entity.id === id);
            if (locatedMarkers.length == 0) return null;
            if (locatedMarkers.length > 1) {
                system.broadcastEvent(SendToMinecraftServer.DisplayChat, "Apparently more than marker was matched by ID... how...?");
            }
            return locatedMarkers[0];
        }
        
        removeMarkers() {
            for (let marker of this.markers) {
                system.destroyEntity(marker.entity);
            }
            this.markers.length = 0;
        }

        createMarkers(gamePieceEntity: GamePieceEntity) {
            for (let move of gamePieceEntity.availableMoves) {
                this.createMarker(move, gamePieceEntity.piece.colour);
            }
        }
    
        createMarker(move: PossiblePieceMove, colour: PieceColour): boolean {
            const worldPosition = this._game.getEntityWorldPosition(move.x, move.z);
    
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
            rotation.y = colour === PieceColour.Black ? 180 : 0;
    
            system.applyComponentChanges(entity, position);
            system.applyComponentChanges(entity, rotation);
            system.applyComponentChanges(entity, marker);
    
            this.markers.push({
                entity: entity,
                type: "marker",
                boardPosition: marker.position,
            })
    
            return true;
        }
    }

    class BoardGenerator {
        private readonly pieceSets: PieceSet[] = [
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

        constructor(private game: GameState) {
        }

        getBlockType(boardPosition: VectorXZ) {
            const blockType = !!((boardPosition.x % 2) ^ (boardPosition.z % 2));
            const block = blockType ? 'concrete 15' : 'concrete 0';
            return block;
        }

        createBoard() {
            const position = this.game.getWorldPosition(0, 0), x = position.x, z = position.z

            //FIXME: Remove this when we start looking at resuming games
            system.getEntitiesFromQuery(positionQuery, x - 8, 0, z, x + 16 + 8, 16, z + 16 + 8)
                .filter(e => e.__identifier__ !== "minecraft:player")
                .forEach(e => system.destroyEntity(e));

            executeCommand(`/fill ${x} ${gameYLevel} ${z} ${x + 16} ${gameYLevel} ${z +16} air`);

            for (let gridZ = 0; gridZ < 8; gridZ++) {
                for (let gridX = 0; gridX < 8; gridX++) {
                    const block = this.getBlockType({x: gridX, z: gridZ});
                    const command = `/fill ${x + gridX * 2} ${gameYLevel} ${z + gridZ * 2} ${x + gridX * 2 + 1} ${gameYLevel} ${z + gridZ * 2 + 1} ${block}`;
                    executeCommand(command);
                }
            }
    
            executeCommand(`/fill ` +
                `${x + 7} ${gameYLevel + 3} ${z + -2} ` + 
                `${x + 8} ${gameYLevel + 3} ${z + -2} ` +
                `concrete 0`);
    
            executeCommand(`/fill ` +
                `${x + 7} ${gameYLevel + 3} ${z + 18} ` + 
                `${x + 8} ${gameYLevel + 3} ${z + 18} ` +
                `concrete 15`)
        }

        createPieceSet(player: PieceColour, pieceSetName: PieceSetName) {
            const pieceSet = this.pieceSets.filter(ps => ps.name === pieceSetName)[0];

            const frontRow = player === PieceColour.Black ? 6 : 1;
            const rearRow = player === PieceColour.Black ? 7 : 0;
    
            this.spawnPiece(pieceSet, Piece.Rook  , player, 0, rearRow);
            this.spawnPiece(pieceSet, Piece.Knight, player, 1, rearRow);
            this.spawnPiece(pieceSet, Piece.Bishop, player, 2, rearRow);
            this.spawnPiece(pieceSet, Piece.King  , player, 3, rearRow);
            this.spawnPiece(pieceSet, Piece.Queen , player, 4, rearRow);
            this.spawnPiece(pieceSet, Piece.Bishop, player, 5, rearRow);
            this.spawnPiece(pieceSet, Piece.Knight, player, 6, rearRow);
            this.spawnPiece(pieceSet, Piece.Rook  , player, 7, rearRow);
            for (let i = 0; i < 8; ++i) {
                this.spawnPiece(pieceSet, Piece.Pawn, player, i, frontRow);
            }
        }
    
        spawnPiece(pieceSet: PieceSet, piece: Piece, colour: PieceColour, x: number, z: number) {
            const entity = system.createEntity(EntityType.Entity, pieceSet.pieces[piece]);
            const chessPiece = system.createComponent<ChessPieceComponent>(entity, ChessComponents.ChessPiece)
            const position = system.getComponent(entity, MinecraftComponent.Position);
            const rotation = system.getComponent(entity, MinecraftComponent.Rotation);
    
            const worldPosition = this.game.getEntityWorldPosition(x, z);
    
            chessPiece.type = piece;
            chessPiece.colour = colour;
            chessPiece.forwardVectorZ = colour === PieceColour.White ? 1 : -1; 
            position.x = worldPosition.x;
            position.y = gameYLevel + 1;
            position.z = worldPosition.z;
            rotation.y = colour === PieceColour.Black ? 180 : 0;
    
            system.applyComponentChanges(entity, chessPiece);
            system.applyComponentChanges(entity, position);
            system.applyComponentChanges(entity, rotation);
            
            this.game.addPiece({
                entity: entity,
                boardPosition: {
                    x: x,
                    z: z,
                },
                piece: chessPiece,
                type: "piece",
                availableMoves: []
            })
        }

        updateHighlightedBlock(highlightedBlock: VectorXZ, boardPosition: VectorXZ) {
            if (!!highlightedBlock) {
                if (!!boardPosition && (highlightedBlock.x == boardPosition.x && highlightedBlock.z == boardPosition.z)) return;

                const block = this.getBlockType(highlightedBlock);
                const worldPosition = this.game.getWorldPosition(highlightedBlock.x, highlightedBlock.z)
                const command = `/fill ${worldPosition.x} ${gameYLevel} ${worldPosition.z} ${worldPosition.x + 1} ${gameYLevel} ${worldPosition.z + 1} ${block}`;
                executeCommand(command);
            }

            if (!!boardPosition) {
                const worldPosition = this.game.getWorldPosition(boardPosition.x, boardPosition.z)
                
                const command = `/fill ${worldPosition.x} ${gameYLevel} ${worldPosition.z} ${worldPosition.x + 1} ${gameYLevel} ${worldPosition.z + 1} diamond_block`;
                executeCommand(command);
            }
        }
    }

    class MoveManager {
        
        constructor(private game: GameState) {

        }

        updateAvailableMoves(...locations: VectorXZ[]) {   
            const piecesToUpdate = locations
                .map(l => this.game.allPieces.filter(p => p.availableMoves.some(am => am.x === l.x && am.z === l.z)))
                .filter((val, index, self) => self.indexOf(val) === index)
                .reduce((p, c) => [...p, ...c], []);
    
            for (let piece of piecesToUpdate) {
                this.updatePieceMoves(piece);
            }
        }
    
        updatePieceMoves(piece: GamePieceEntity) {
            piece.availableMoves = this.calculatePieceMoves(piece);
        }
    
        movePiece(entity: GamePieceEntity, newBoardPosition: VectorXZ) {
            const move = this.calculatePieceMoves(entity, entity.boardPosition)
                            .filter(move => move.x === newBoardPosition.x && move.z === newBoardPosition.z);
    
            //FIXME: Manage if user clicked on a marker that was actually an attack.
            if (move.length > 0 && move[0].type === MoveType.Empty) {
                const worldPositionComponent = system.getComponent(entity.entity, MinecraftComponent.Position);
                const worldPosition = this.game.getEntityWorldPosition(newBoardPosition.x, newBoardPosition.z);
                worldPositionComponent.x = worldPosition.x;
                worldPositionComponent.z = worldPosition.z;
                entity.boardPosition = newBoardPosition;
                system.applyComponentChanges(entity.entity, worldPositionComponent);
    
                //FIXME: if piece was a pawn, allow them to select a piece.
                return true;
            }
    
            return false;
        }
    
        attackPiece(attackingEntity: GamePieceEntity, attackedEntity: GamePieceEntity) {
            const move = this.calculatePieceMoves(attackingEntity, attackingEntity.boardPosition)
                            .filter(move => move.x === attackedEntity.boardPosition.x && move.z === attackedEntity.boardPosition.z);
    
            if (move.length > 0 && move[0].type === MoveType.Attack) {
                //Move the attacking piece
                const worldPositionComponent = system.getComponent(attackingEntity.entity, MinecraftComponent.Position);
                const worldPosition = this.game.getEntityWorldPosition(attackedEntity.boardPosition.x, attackedEntity.boardPosition.z);
                worldPositionComponent.x = worldPosition.x;
                worldPositionComponent.z = worldPosition.z;
                attackingEntity.boardPosition.x = attackedEntity.boardPosition.x;
                attackingEntity.boardPosition.z = attackedEntity.boardPosition.z;
    
                //FIXME: Rather than remove, move the piece off to the side.
                this.game.removePiece(attackedEntity)
                system.destroyEntity(attackedEntity.entity);
    
                system.applyComponentChanges(attackingEntity.entity, worldPositionComponent);
                return true;
            }
    
            return false;
        }

        calculatePieceMoves(piece: GamePieceEntity, boardPosition?: VectorXZ): PossiblePieceMove[] {
            if (!boardPosition) {
                boardPosition = piece.boardPosition;
            }
    
            switch(piece.piece.type) {
                case Piece.Pawn:
                    return this.calculatePawnMoves(piece, boardPosition);
                case Piece.Bishop:
                    return this.calculateBishopMoves(piece, boardPosition);
                case Piece.Rook:
                    return this.calculateRookMoves(piece, boardPosition);
                case Piece.Queen:
                    return this.calculateQueenMoves(piece, boardPosition);
                case Piece.King:
                    return this.calculateKingMoves(piece, boardPosition);
                case Piece.Knight:
                    return this.calculateKnightMoves(piece, boardPosition);
            }
            return [];
        }
    
        checkCanMove(piece: GamePieceEntity, x: number, z: number, canAttack: boolean, addItem: (possiblePieceMove: PossiblePieceMove) => void): boolean {
            if (x < 0 || x >= 8) return false;
            if (z < 0 || z >= 8) return false;
    
            const gamePiece = this.game.findPieceAtLocation({x: x, z: z});
            const move: PossiblePieceMove = {
                x: x,
                z: z,
                type: MoveType.Empty
            }

            if (!!gamePiece) {
                if (gamePiece.piece.colour === piece.piece.colour) {
                    move.type = MoveType.Guarding;
                }
                if (canAttack && gamePiece.piece.colour !== piece.piece.colour) {
                    move.type = MoveType.Attack;
                } else {
                    move.type = MoveType.Blocked;
                }
            }

            addItem(move);

            return move.type === MoveType.Attack || move.type === MoveType.Empty;
        }
    
        calculatePawnMoves(piece: GamePieceEntity, boardPosition: VectorXZ): PossiblePieceMove[] {
            const moves: PossiblePieceMove[] = [];
            let canPlace = true;
    
            canPlace = canPlace && this.checkCanMove(piece, boardPosition.x, boardPosition.z + 1 * piece.piece.forwardVectorZ, false, move => moves.push(move));
            canPlace = canPlace && this.checkCanMove(piece, boardPosition.x, boardPosition.z + 2 * piece.piece.forwardVectorZ, false, move => moves.push(move));
    
            //Only add these moves if it is a valid attack target.
            this.checkCanMove(piece, boardPosition.x + 1, boardPosition.z + 1 * piece.piece.forwardVectorZ, true, move => move.type === MoveType.Attack && moves.push(move))
            this.checkCanMove(piece, boardPosition.x - 1, boardPosition.z + 1 * piece.piece.forwardVectorZ, true, move => move.type === MoveType.Attack && moves.push(move))
            return moves;
        }
    
        calculateBishopMoves(piece: GamePieceEntity, boardPosition: VectorXZ): PossiblePieceMove[] {
            const moves: PossiblePieceMove[] = [];
            const directions :VectorXZ[] = [{x: 1, z: 1}, {x: -1, z: 1}, {x: 1, z: -1}, {x: -1, z: -1}];
    
            for (let direction of directions) {
                let position: VectorXZ = {x: boardPosition.x, z: boardPosition.z};
                let canPlace = true;
                while (canPlace) {
                    position.x += direction.x;
                    position.z += direction.z;
                    canPlace = this.checkCanMove(piece, position.x, position.z, true, move => moves.push(move));
                }
            }
            return moves;
        }

        calculateKnightMoves(piece: GamePieceEntity, boardPosition: VectorXZ): PossiblePieceMove[] {
            const moves: PossiblePieceMove[] = [];
            const directions :VectorXZ[] = [
                {x: -1, z: -2}, {x: 1, z: -2}, {x: -2, z: -1}, {x: 2, z: -1},
                {x: -2, z: 1}, {x: 2, z: 1}, {x: -1, z: 2}, {x: 1, z: 2}
            ];
            
            for (let direction of directions) {
                const x = boardPosition.x + direction.x;
                const z = boardPosition.z + direction.z;
                this.checkCanMove(piece, x, z, true, move => moves.push(move));
            }
            return moves;
        }
    
        calculateRookMoves(piece: GamePieceEntity, boardPosition: VectorXZ): PossiblePieceMove[] {
            const moves: PossiblePieceMove[] = [];
            const directions :VectorXZ[] = [{x: 1, z: 0}, {x: -1, z: 0}, {x: 0, z: -1}, {x: 0, z: 1}];
            
            for (let direction of directions) {
                let x = boardPosition.x;
                let z = boardPosition.z;
                let canPlace = true;
                while (canPlace) {
                    x += direction.x;
                    z += direction.z;
                    canPlace = this.checkCanMove(piece, x, z, true, move => moves.push(move));
                }
            }
            return moves;
        }
    
        calculateQueenMoves(piece: GamePieceEntity, boardPosition: VectorXZ): PossiblePieceMove[] {
            const moves: PossiblePieceMove[] = [];
            const directions :VectorXZ[] = [
                {x: 1, z: 0}, {x: -1, z: 0}, {x: 0, z: -1}, {x: 0, z: 1},
                {x: 1, z: 1}, {x: -1, z: 1}, {x: 1, z: -1}, {x: -1, z: -1}
            ];
            
            for (let direction of directions) {
                let x = boardPosition.x;
                let z = boardPosition.z;
                let canPlace = true;
                while (canPlace) {
                    x += direction.x;
                    z += direction.z;
                    canPlace = this.checkCanMove(piece, x, z, true, move => moves.push(move));
                }
            }
            return moves;
        }
    
        calculateKingMoves(piece: GamePieceEntity, boardPosition: VectorXZ): PossiblePieceMove[] {
            const moves: PossiblePieceMove[] = [];
            const directions :VectorXZ[] = [
                {x: 1, z: 0}, {x: -1, z: 0}, {x: 0, z: -1}, {x: 0, z: 1},
                {x: 1, z: 1}, {x: -1, z: 1}, {x: 1, z: -1}, {x: -1, z: -1}
            ];
            
            for (let direction of directions) {
                const x = boardPosition.x + direction.x;
                const z = boardPosition.z + direction.z;
                //FIXME: verify move would not cause a check/checkmate.
                this.checkCanMove(piece, x, z, true, move => moves.push(move));
            }
            return moves;
        }
    
        isKingInCheck(kingPieceEntity: GamePieceEntity, atPosition: VectorXZ): KingState {
            const possibleEnemyMoves: PossiblePieceMove[] = [];
            for (let entity of this.game.allPieces) {
                if (entity.piece.colour === kingPieceEntity.piece.colour) continue;
    
                possibleEnemyMoves.push(...entity.availableMoves);
            }
    
            const availableKingMoves = kingPieceEntity.availableMoves;
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
    }

    class GameState {
        pieces: {
            'white': GamePieceEntity[];
            'black': GamePieceEntity[];
        } = {
            'white': [],
            'black': []
        };
        selectedPiece: GamePieceEntity = null;

        hasStarted: boolean = false;
        players: IEntityObject[] = [];
        currentPlayerColour: PieceColour = PieceColour.White;
        isComplete: boolean = false;

        public readonly _worldLocation: VectorXZ;

        public get worldLocation(): VectorXZ {
            return {x: this._worldLocation.x, z: this._worldLocation.z};
        }

        constructor(public location: VectorXZ) {
            this._worldLocation = {
                x: location.x * distanceBetweenGames,
                z: location.z * distanceBetweenGames
            }
        }

        initialize() {
            const otherEntities: EntityNearPlayfield[] = []
            
            //FIXME: When we can save game state, use this as part of resuming a game.
            /*system.getEntitiesFromQuery(positionQuery, startX - 8, 0, startZ, startX + 16 + 8, 16, startZ + 16 + 8)
                .forEach(entity => {
                    const position = system.getComponent(entity, MinecraftComponent.Position);
                    const playfieldEntity: EntityNearPlayfield = {
                        entity: entity,
                        type: "other",
                        boardPosition: this.getBoardPosition(position.x, position.z)
                    }
                    if (entity.__identifier__ === "minecraft:player") {
                        return;
                    } else {
                        const piece = system.getComponent<ChessPieceComponent>(entity, ChessComponents.ChessPiece);
                        if (!!piece) {
                            const gamePieceEntity = <GamePieceEntity>playfieldEntity;
                            playfieldEntity.type = "piece"
                            gamePieceEntity.piece = piece;
                            this.pieces[piece.colour].push(gamePieceEntity);
                            return;
                        }
                    }

                    otherEntities.push(playfieldEntity);
                });
            for (let entity of otherEntities) {
                system.destroyEntity(entity.entity);
            }
            */
        }

        getBoardPosition(worldX: number, worldZ: number) {
            const x = Math.floor((worldX - this._worldLocation.x) / 2);
            const z = Math.floor((worldZ - this._worldLocation.z) / 2)
            if (x < 0 || x >= 8) return null;
            if (z < 0 || z >= 8) return null;
            return {x: x, z: z};
        }
    
        getWorldPosition(boardX: number, boardZ: number) {
            if (boardX < 0 || boardX >= 8) return null;
            if (boardZ < 0 || boardZ >= 8) return null;
        
            const worldPosition: VectorXZ = {
                x: this._worldLocation.x + boardX * 2,
                z: this._worldLocation.z + boardZ * 2
            }
            return worldPosition;
        }
    
        getEntityWorldPosition(boardX: number, boardZ: number) {
            var worldPosition = this.getWorldPosition(boardX, boardZ);
            if (!worldPosition) return null;
    
            const entityPosition: VectorXYZ = {
                x: worldPosition.x + 1,
                y: gameYLevel + 1,
                z: worldPosition.z + 1
            }
            return entityPosition;
        }

        findPieceById(id: number) {
            const locatedPieces = this.allPieces.filter(p => p.entity.id === id);
            if (locatedPieces.length == 0) return null;
            if (locatedPieces.length > 1) {
                system.broadcastEvent(SendToMinecraftServer.DisplayChat, "Apparently more than piece was matched by ID... how...?");
            }
            return locatedPieces[0];
        }
    
        get allPieces() {
            return this.pieces.black.concat(this.pieces.white);
        }

        findPiecesByType(colour: PieceColour, kind: Piece) {
            return this.pieces[colour].filter(p => p.piece.type === kind);
        }
    
        findPieceAtLocation(boardLocation: VectorXZ) {
            const locatedPieces = this.allPieces.filter(p => p.boardPosition.x == boardLocation.x && p.boardPosition.z === boardLocation.z);
            if (locatedPieces.length == 0) return null;
            if (locatedPieces.length > 1) {
                system.broadcastEvent(SendToMinecraftServer.DisplayChat, "Apparently more than piece was matched by ID... how...?");
            }
            return locatedPieces[0];
        }

        addPiece(pieceEntity: GamePieceEntity) {
            this.pieces[pieceEntity.piece.colour].push(pieceEntity)
        }

        removePiece(pieceEntity: GamePieceEntity) {
            this.pieces[pieceEntity.piece.colour] = this.pieces[pieceEntity.piece.colour].filter(p => p.entity.id !== pieceEntity.entity.id)
        }

        
    }
}
