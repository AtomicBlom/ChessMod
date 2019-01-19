import { MarkerManager } from "./MarkerManager";
import { VectorXZ, PlayerLocation } from "../maths";
import { GameState } from "./GameState";
import { PieceColour, PieceSetName, KingState, GameInstance, Piece } from "../chess";
import { ChessEvents } from "../events";
import { BoardGenerator } from "./BoardGenerator";
import { MoveManager } from "./MoveManager";
import { gameYLevel } from "../constants";

export class GameManager {
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

    constructor(private _system: IVanillaServerSystem, private _game: GameState) {
        this._boardGenerator = new BoardGenerator(_system, _game);
        this._moveManager = new MoveManager(_system, _game);
        this._markerManager = new MarkerManager(_system, _game);
    }

    initialize() {
        this._boardGenerator.createBoard();
        this._boardGenerator.createPieceSetBlitzkreigBlack(PieceColour.Black, PieceSetName.Overworld);
        this._boardGenerator.createPieceSetBlitzkreigWhite(PieceColour.White, PieceSetName.Overworld);
        //this._boardGenerator.createPieceSet(PieceColour.Black, PieceSetName.Overworld);
        //this._boardGenerator.createPieceSet(PieceColour.White, PieceSetName.Overworld);
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

        this._system.broadcastEvent(ChessEvents.GameStarting, startEvent);
        this._game.hasStarted = true;
    }

    hasPlayer(id: number) {
        return this._game.players.some(p => p.id === id)
    }

    setPlayerNumber(player: IEntityObject, playerNumber: number) {
        const worldLocation = this._game.worldLocation;
        const playerName = this._system.getComponent(player, MinecraftComponent.Nameable);
        const playerLocation: PlayerLocation = playerNumber == 1 ? { x: 7, y: 4, z: -2, rotation: 0 } : { x: 7, y: 4, z: 18, rotation: 180 }
        const movePlayerCommand = `/tp ${playerName.name} ${worldLocation.x + playerLocation.x + 0.5} ${gameYLevel + playerLocation.y} ${worldLocation.z + playerLocation.z} ${playerLocation.rotation} 40`;
        this._system.broadcastEvent(SendToMinecraftServer.ExecuteCommand, movePlayerCommand);
        this._system.broadcastEvent(ChessEvents.SetPlayerNumber, { player: player, number: playerNumber });
    }

    processPlayerSelect(player: IEntityObject, attackedEntity: IEntityObject) {
        if (this._game.isComplete) {
            return;
        }

        const expectedPlayer = this._game.players[this._game.currentPlayerColour === PieceColour.White ? 0 : 1];
        if (expectedPlayer.id !== player.id) {
            this._system.broadcastEvent(SendToMinecraftServer.DisplayChat, `It is not your turn`);
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
                    this._system.broadcastEvent(SendToMinecraftServer.DisplayChat, `Cannot select ${chessPiece.type} at ${boardPosition.x},${boardPosition.z} belongs to ${chessPiece.colour}`);
                    return;
                };
                //Now let's make sure that the piece can actually do something.
                if (attackedPiece.availableMoves.length === 0) {
                    this._system.broadcastEvent(SendToMinecraftServer.DisplayChat, `Cannot select ${chessPiece.type} at ${boardPosition.x},${boardPosition.z} there are no moves available`);
                    return;
                };
                //If we got this far, we have an entity we can select, so let's start tracking it
                this._system.broadcastEvent(SendToMinecraftServer.DisplayChat, `Selected ${chessPiece.colour} ${chessPiece.type} at ${boardPosition.x},${boardPosition.z}`);
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
                    this._system.broadcastEvent(SendToMinecraftServer.DisplayChat, `Cancelled move for ${chessPiece.type} at ${boardPosition.x},${boardPosition.z}`);
                    return;
                }

                //The player has chosen to attacking a piece
                //First make sure they're not attacking their own piece.
                //FIXME: This is where we would need something special in here to allow castling
                if (chessPiece.colour === this._game.currentPlayerColour) {
                    this._system.broadcastEvent(SendToMinecraftServer.DisplayChat, `Cannot attack ${chessPiece.type} at ${boardPosition.x},${boardPosition.z} belongs to you`);
                    return;
                }

                //Checks passed? Ok, let's attack!
                this._system.broadcastEvent(SendToMinecraftServer.DisplayChat, `Attacking ${chessPiece.colour} ${chessPiece.type} at ${boardPosition.x},${boardPosition.z}`);
                const originalPosition = {
                    x: selectedPiece.boardPosition.x,
                    z: selectedPiece.boardPosition.z
                }
                if (this._moveManager.movePiece(selectedPiece, attackedPiece.boardPosition)) {
                    //After the attack was successful, we need to refresh any pieces affected by the before and after locations of the selected piece.
                    this._moveManager.updateAvailableMoves(originalPosition, boardPosition);
                    //FIXME: Do I really need this?
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
                this._system.broadcastEvent(SendToMinecraftServer.DisplayChat, `Moving piece to ${boardPosition.x},${boardPosition.z}`);
                const previousPiecePosition: VectorXZ = {x: this._game.selectedPiece.boardPosition.x, z: this._game.selectedPiece.boardPosition.z}
                //Move the selected piece to tdhe marker's location
                if (this._moveManager.movePiece(this._game.selectedPiece, boardPosition)) {
                    //After a successful move, we need to refresh any pieces affected by the before and after locations of the selected piece.
                    this._moveManager.updateAvailableMoves(previousPiecePosition, boardPosition)

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
                this._system.broadcastEvent(SendToMinecraftServer.DisplayChat, `${previousPlayerColour} has won the game`);
                return;
            }
        }

        this._system.broadcastEvent(SendToMinecraftServer.DisplayChat, `It is now ${this._game.currentPlayerColour}'s turn`);
    }

    addPlayer(player: IEntityObject) {
        this._game.players.push(player);

        this.setPlayerNumber(player, this._game.players.length);
        return this._game.players.length
    }
}