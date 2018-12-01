export const enum ChessEvents {
    JoinNewGame = 'chess:join_new_game',
    GameStarting = 'chess:notify_game_starting'
}

export interface GameBoard {
    location: Location2;
    hasStarted: boolean;
    players: IEntityObject[];
}

export interface Location2 {
    x: number;
    z: number;
}

export interface PlayerLocation {
    x: number;
    y: number;
    z: number;
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