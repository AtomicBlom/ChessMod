///<reference types="minecraft-scripting-types-shared" />
import { VectorXZ } from "./maths";

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

export interface GameBoard {
    selectedPiece: IEntityObject;
    location: VectorXZ;
    hasStarted: boolean;
    players: IEntityObject[];
    currentPlayerColour: PieceColour;
    highlightedBlock: VectorXZ;
    isComplete: boolean;
}