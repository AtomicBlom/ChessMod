import { GamePieceEntity, PieceColour, Piece, EntityNearPlayfield } from "../chess";
import { VectorXZ } from "../maths";
import { distanceBetweenGames, gameYLevel } from "../constants";

export class GameState {
    pieces: {
        'white': GamePieceEntity[];
        'black': GamePieceEntity[];
    } = {
            'white': [],
            'black': []
        };
    selectedPiece: GamePieceEntity = null;

    hasStarted: boolean = false;
    players: IEntity[] = [];
    currentPlayerColour: PieceColour = PieceColour.White;
    isComplete: boolean = false;

    public readonly _worldLocation: VectorXZ;

    public get worldLocation(): VectorXZ {
        return { x: this._worldLocation.x, z: this._worldLocation.z };
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
        return { x: x, z: z };
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
            server.log("Apparently more than piece was matched by ID... how...?");
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
            server.log("Apparently more than piece was matched by ID... how...?");
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