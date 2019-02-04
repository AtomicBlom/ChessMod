///<reference types="minecraft-scripting-types-shared" />
import { VectorXZ } from "./maths";

export interface GameInstance {
    players: IEntity[];
    location: VectorXZ;
    worldLocation: VectorXZ;
}

export interface PieceSet {
    name: PieceSetName,
    pieces: PieceDefinition
}

export const enum PieceSetName {
    Overworld = "Overworld",
    Nether = "Nether",
    TheEnd = "TheEnd",
    Villagers = "Villagers",
    FriendlyMobs = "FriendlyMobs"
}

export interface PieceDefinition {
    king: string;
    queen: string;
    rook: string;
    bishop: string;
    knight: string;
    pawn: string;
}

export const enum Piece {
    King = "king",
    Queen = "queen",
    Rook = "rook",
    Bishop = "bishop",
    Knight = "knight",
    Pawn = "pawn"
}

export const enum PieceColour {
    Black = "black",
    White = "white"
}

    
export interface EntityNearPlayfield {
    entity: IEntity;
    type: "player" | "marker" | "piece" | "other";
    boardPosition: VectorXZ; 
}

export interface GamePieceEntity extends EntityNearPlayfield {
    type: "piece";
    piece: ChessPieceComponent,
    availableMoves: PossiblePieceMove[]
}

export interface MarkerEntity extends EntityNearPlayfield {
    type: "marker";
}

export const enum ChessComponents {
    ChessPiece = "chess:chess_piece",
    Marker = "chess:marker"
}
export interface MarkerComponent {
    position: VectorXZ;
}
export interface ChessPieceComponent {
    hasMoved: any;
    type: Piece;
    colour: PieceColour;
    forwardVectorZ: 1 | -1;
}

export interface PossiblePieceMove {
    x: number,
    z: number,
    type: MoveType,
}

export const enum KingState {
    Safe = 'safe',
    Check = 'check',
    CheckMate = 'checkmate',
    Trapped = 'trapped'
}

export const enum MoveType {
    Blocked = 'blocked',
    Attack = 'attack',
    Empty = 'empty',
    Guarding = 'guarding'
}