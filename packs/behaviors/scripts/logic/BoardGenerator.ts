import { PieceSet, PieceSetName, PieceColour, Piece, ChessPieceComponent, ChessComponents } from "../chess";
import { GameState } from "./GameState";
import { VectorXZ } from "../maths";
import { gameYLevel } from "../constants";

export class BoardGenerator {
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

    private readonly _positionQuery: IQuery;

    constructor(private _system: IVanillaServerSystem, private game: GameState) {
        this._positionQuery = _system.registerQuery(MinecraftComponent.Position);
    }

    getBlockType(boardPosition: VectorXZ) {
        const blockType = !!((boardPosition.x % 2) ^ (boardPosition.z % 2));
        const block = blockType ? 'concrete 15' : 'concrete 0';
        return block;
    }

    createBoard() {
        const position = this.game.getWorldPosition(0, 0), x = position.x, z = position.z

        //FIXME: Remove this when we start looking at resuming games
        this._system.getEntitiesFromQuery(this._positionQuery, x - 8, 0, z, x + 16 + 8, 16, z + 16 + 8)
            .filter(e => e.__identifier__ !== "minecraft:player")
            .forEach(e => this._system.destroyEntity(e));

        this.executeCommand(`/fill ${x} ${gameYLevel} ${z} ${x + 16} ${gameYLevel} ${z + 16} air`);

        for (let gridZ = 0; gridZ < 8; gridZ++) {
            for (let gridX = 0; gridX < 8; gridX++) {
                const block = this.getBlockType({ x: gridX, z: gridZ });
                const command = `/fill ${x + gridX * 2} ${gameYLevel} ${z + gridZ * 2} ${x + gridX * 2 + 1} ${gameYLevel} ${z + gridZ * 2 + 1} ${block}`;
                this.executeCommand(command);
            }
        }

        this.executeCommand(`/fill ` +
            `${x + 7} ${gameYLevel + 3} ${z + -2} ` +
            `${x + 8} ${gameYLevel + 3} ${z + -2} ` +
            `concrete 0`);

            this.executeCommand(`/fill ` +
            `${x + 7} ${gameYLevel + 3} ${z + 18} ` +
            `${x + 8} ${gameYLevel + 3} ${z + 18} ` +
            `concrete 15`);
    }

    createPieceSet(player: PieceColour, pieceSetName: PieceSetName) {
        const pieceSet = this.pieceSets.filter(ps => ps.name === pieceSetName)[0];

        const frontRow = player === PieceColour.Black ? 6 : 1;
        const rearRow = player === PieceColour.Black ? 7 : 0;

        this.spawnPiece(pieceSet, Piece.Rook, player, 0, rearRow);
        this.spawnPiece(pieceSet, Piece.Knight, player, 1, rearRow);
        this.spawnPiece(pieceSet, Piece.Bishop, player, 2, rearRow);
        this.spawnPiece(pieceSet, Piece.King, player, 3, rearRow);
        this.spawnPiece(pieceSet, Piece.Queen, player, 4, rearRow);
        this.spawnPiece(pieceSet, Piece.Bishop, player, 5, rearRow);
        this.spawnPiece(pieceSet, Piece.Knight, player, 6, rearRow);
        this.spawnPiece(pieceSet, Piece.Rook, player, 7, rearRow);

        for (let i = 0; i < 8; ++i) {
            this.spawnPiece(pieceSet, Piece.Pawn, player, i, frontRow);
        }
    }

    createPieceSetBlitzkreigWhite(player: PieceColour, pieceSetName: PieceSetName) {
        const pieceSet = this.pieceSets.filter(ps => ps.name === pieceSetName)[0];

        const frontRow = player === PieceColour.Black ? 6 : 1;
        const rearRow = player === PieceColour.Black ? 7 : 0;

        this.spawnPiece(pieceSet, Piece.Rook, player, 0, rearRow);
        this.spawnPiece(pieceSet, Piece.Knight, player, 1, rearRow);
        this.spawnPiece(pieceSet, Piece.Bishop, player, 5, 3);
        this.spawnPiece(pieceSet, Piece.King, player, 3, rearRow);
        this.spawnPiece(pieceSet, Piece.Queen, player, 0, 4);
        this.spawnPiece(pieceSet, Piece.Bishop, player, 5, rearRow);
        this.spawnPiece(pieceSet, Piece.Knight, player, 6, rearRow);
        this.spawnPiece(pieceSet, Piece.Rook, player, 7, rearRow);
        
        this.spawnPiece(pieceSet, Piece.Pawn, player, 0, frontRow);
        this.spawnPiece(pieceSet, Piece.Pawn, player, 1, frontRow);
        this.spawnPiece(pieceSet, Piece.Pawn, player, 2, frontRow);
        this.spawnPiece(pieceSet, Piece.Pawn, player, 3, 2);
        this.spawnPiece(pieceSet, Piece.Pawn, player, 4, frontRow);
        this.spawnPiece(pieceSet, Piece.Pawn, player, 5, frontRow);
        this.spawnPiece(pieceSet, Piece.Pawn, player, 6, frontRow);
        this.spawnPiece(pieceSet, Piece.Pawn, player, 7, frontRow);
    }

    createPieceSetBlitzkreigBlack(player: PieceColour, pieceSetName: PieceSetName) {
        const pieceSet = this.pieceSets.filter(ps => ps.name === pieceSetName)[0];

        const frontRow = player === PieceColour.Black ? 6 : 1;
        const rearRow = player === PieceColour.Black ? 7 : 0;

        this.spawnPiece(pieceSet, Piece.Rook, player, 0, rearRow);
        this.spawnPiece(pieceSet, Piece.Knight, player, 1, rearRow);
        this.spawnPiece(pieceSet, Piece.Bishop, player, 2, rearRow);
        this.spawnPiece(pieceSet, Piece.King, player, 3, rearRow);
        this.spawnPiece(pieceSet, Piece.Queen, player, 4, rearRow);
        this.spawnPiece(pieceSet, Piece.Bishop, player, 5, rearRow);
        this.spawnPiece(pieceSet, Piece.Knight, player, 6, rearRow);
        this.spawnPiece(pieceSet, Piece.Rook, player, 7, rearRow);
        
        this.spawnPiece(pieceSet, Piece.Pawn, player, 0, frontRow);
        this.spawnPiece(pieceSet, Piece.Pawn, player, 1, frontRow);
        this.spawnPiece(pieceSet, Piece.Pawn, player, 2, frontRow);
        this.spawnPiece(pieceSet, Piece.Pawn, player, 3, frontRow);
        this.spawnPiece(pieceSet, Piece.Pawn, player, 4, frontRow);
        this.spawnPiece(pieceSet, Piece.Pawn, player, 5, frontRow);
        this.spawnPiece(pieceSet, Piece.Pawn, player, 6, frontRow);
        this.spawnPiece(pieceSet, Piece.Pawn, player, 7, 3);
    }

    spawnPiece(pieceSet: PieceSet, piece: Piece, colour: PieceColour, x: number, z: number) {
        const entity = this._system.createEntity("entity", pieceSet.pieces[piece]);
        const chessPiece = this._system.createComponent<ChessPieceComponent>(entity, ChessComponents.ChessPiece)
        const position = this._system.getComponent(entity, MinecraftComponent.Position);
        const rotation = this._system.getComponent(entity, MinecraftComponent.Rotation);

        const worldPosition = this.game.getEntityWorldPosition(x, z);

        chessPiece.data.type = piece;
        chessPiece.data.colour = colour;
        chessPiece.data.forwardVectorZ = colour === PieceColour.White ? 1 : -1;
        position.data.x = worldPosition.x;
        position.data.y = gameYLevel + 1;
        position.data.z = worldPosition.z;
        rotation.data.y = colour === PieceColour.Black ? 180 : 0;

        this._system.applyComponentChanges(entity, chessPiece);
        this._system.applyComponentChanges(entity, position);
        this._system.applyComponentChanges(entity, rotation);

        this.game.addPiece({
            entity: entity,
            boardPosition: {
                x: x,
                z: z,
            },
            piece: chessPiece.data,
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
            this.executeCommand(command);
        }

        if (!!boardPosition) {
            const worldPosition = this.game.getWorldPosition(boardPosition.x, boardPosition.z)

            const command = `/fill ${worldPosition.x} ${gameYLevel} ${worldPosition.z} ${worldPosition.x + 1} ${gameYLevel} ${worldPosition.z + 1} diamond_block`;
            this.executeCommand(command);
        }
    }

    executeCommand(command: string) {
        this._system.broadcastEvent(SendToMinecraftServer.ExecuteCommand, command);
    }
}