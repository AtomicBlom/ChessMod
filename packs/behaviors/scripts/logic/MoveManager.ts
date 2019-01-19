/// <reference types="minecraft-scripting-types-server" />

import { GameState } from "./GameState";
import { VectorXZ } from "../maths";
import { GamePieceEntity, MoveType, Piece, PossiblePieceMove, KingState } from "../chess";

export class MoveManager {

    constructor(private system: IVanillaServerSystem, private game: GameState) {
        
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

        let moved = false;
        //FIXME: Manage if user clicked on a marker that was actually an attack.
        if (move.length > 0) {
            if (move[0].type === MoveType.Attack) {
                const attackedEntity =  this.game.findPieceAtLocation(newBoardPosition);
                //FIXME: Rather than remove, move the piece off to the side.
                this.game.removePiece(attackedEntity)
                this.system.destroyEntity(attackedEntity.entity);
            }

            if (move[0].type === MoveType.Empty || move[0].type === MoveType.Attack) {
                const worldPositionComponent = this.system.getComponent(entity.entity, MinecraftComponent.Position);
                const worldPosition = this.game.getEntityWorldPosition(newBoardPosition.x, newBoardPosition.z);

                worldPositionComponent.x = worldPosition.x;
                worldPositionComponent.z = worldPosition.z;
                entity.boardPosition.x = newBoardPosition.x;
                entity.boardPosition.z = newBoardPosition.z;
                moved = entity.piece.hasMoved = true;

                this.system.applyComponentChanges(entity.entity, worldPositionComponent);

                //FIXME: if piece was a pawn and reached the end of the board, allow them to select a piece.
            }
        }

        return moved;
    }

    calculatePieceMoves(piece: GamePieceEntity, boardPosition?: VectorXZ): PossiblePieceMove[] {
        if (!boardPosition) {
            boardPosition = piece.boardPosition;
        }

        switch (piece.piece.type) {
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

        const gamePiece = this.game.findPieceAtLocation({ x: x, z: z });
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

        return move.type === MoveType.Empty;
    }

    calculatePawnMoves(piece: GamePieceEntity, boardPosition: VectorXZ): PossiblePieceMove[] {
        const moves: PossiblePieceMove[] = [];
        let canPlace = true;

        canPlace = canPlace && this.checkCanMove(piece, boardPosition.x, boardPosition.z + 1 * piece.piece.forwardVectorZ, false, move => moves.push(move));
        if (!piece.piece.hasMoved) {
            canPlace = canPlace && this.checkCanMove(piece, boardPosition.x, boardPosition.z + 2 * piece.piece.forwardVectorZ, false, move => moves.push(move));
        }

        //Only add these moves if it is a valid attack target.
        this.checkCanMove(piece, boardPosition.x + 1, boardPosition.z + 1 * piece.piece.forwardVectorZ, true, move => move.type === MoveType.Attack && moves.push(move))
        this.checkCanMove(piece, boardPosition.x - 1, boardPosition.z + 1 * piece.piece.forwardVectorZ, true, move => move.type === MoveType.Attack && moves.push(move))
        return moves;
    }

    calculateBishopMoves(piece: GamePieceEntity, boardPosition: VectorXZ): PossiblePieceMove[] {
        const moves: PossiblePieceMove[] = [];
        const directions: VectorXZ[] = [{ x: 1, z: 1 }, { x: -1, z: 1 }, { x: 1, z: -1 }, { x: -1, z: -1 }];

        for (let direction of directions) {
            let position: VectorXZ = { x: boardPosition.x, z: boardPosition.z };
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
        const directions: VectorXZ[] = [
            { x: -1, z: -2 }, { x: 1, z: -2 }, { x: -2, z: -1 }, { x: 2, z: -1 },
            { x: -2, z: 1 }, { x: 2, z: 1 }, { x: -1, z: 2 }, { x: 1, z: 2 }
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
        const directions: VectorXZ[] = [
            { x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: -1 }, { x: 0, z: 1 }
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

    calculateQueenMoves(piece: GamePieceEntity, boardPosition: VectorXZ): PossiblePieceMove[] {
        const moves: PossiblePieceMove[] = [];
        const directions: VectorXZ[] = [
            { x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: -1 }, { x: 0, z: 1 },
            { x: 1, z: 1 }, { x: -1, z: 1 }, { x: 1, z: -1 }, { x: -1, z: -1 }
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
        const directions: VectorXZ[] = [
            { x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: -1 }, { x: 0, z: 1 },
            { x: 1, z: 1 }, { x: -1, z: 1 }, { x: 1, z: -1 }, { x: -1, z: -1 }
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
            possibleEnemyMoves.push(...entity.availableMoves.filter(am => am.type === MoveType.Attack || am.type === MoveType.Empty));
        }

        const availableKingMoves = kingPieceEntity.availableMoves.filter(am => am.type === MoveType.Attack || am.type === MoveType.Empty);
        const isCheck = possibleEnemyMoves.some(enemyMove => enemyMove.x === atPosition.x && enemyMove.z === atPosition.z);
        const canKingMove = availableKingMoves.filter(
            kingMove => !possibleEnemyMoves.some(
                enemyMove => enemyMove.x === kingMove.x && enemyMove.z === kingMove.z
            )
        );

        
        
        
        //FIXME: verify that an attack by the king wouldn't result in the king being in check.


        let kingState: KingState;
        if (isCheck) {
            if (!canKingMove) {
                kingState = KingState.CheckMate;
            } else {
                kingState = KingState.Check;
            }
        } else {
            if (canKingMove) {
                kingState = KingState.Safe;
            } else {
                kingState = KingState.Trapped;
            }
        }

        this.system.broadcastEvent(SendToMinecraftServer.DisplayChat, `${kingPieceEntity.piece.colour} king has ${canKingMove.length} moves - ${kingState}`);

        for (const move of canKingMove) {
            this.system.broadcastEvent(SendToMinecraftServer.DisplayChat, `${move.x}, ${move.z} - ${move.type}`);
        }

        return kingState;
    }
}