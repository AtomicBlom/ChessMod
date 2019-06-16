import { MarkerManager } from "./MarkerManager";
import { VectorXZ, PlayerLocation } from "../maths";
import { GameState } from "./GameState";
import { PieceColour, PieceSetName, KingState, GameInstance, Piece } from "../chess";
import { ChessEvents, SetPlayerNumberEvent } from "../events";
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

        const gameStartingEventData = this._system.createEventData<GameInstance>(ChessEvents.GameStarting);
        Object.assign(
            gameStartingEventData.data,
            <GameInstance>{
                players: this._game.players,
                location: this._game.location,
                worldLocation: this._game.worldLocation
            }
        );

        this._system.broadcastEvent(ChessEvents.GameStarting, gameStartingEventData);
        this._game.hasStarted = true;
    }

    hasPlayer(id: number) {
        return this._game.players.some(p => p.id === id)
    }

    setPlayerNumber(player: IEntity, playerNumber: number) {
        const worldLocation = this._game.worldLocation;
        const playerName = this._system.getComponent(player, MinecraftComponent.Nameable);
        const playerLocation: PlayerLocation = playerNumber == 1 ? { x: 7, y: 4, z: -2, rotation: 0 } : { x: 7, y: 4, z: 18, rotation: 180 }
        const movePlayerCommand = `/tp ${playerName.data.name} ${worldLocation.x + playerLocation.x + 0.5} ${gameYLevel + playerLocation.y} ${worldLocation.z + playerLocation.z} ${playerLocation.rotation} 40`;
        this._system.executeCommand(movePlayerCommand, () => {});

        const setPlayerNumberEvent = this._system.createEventData<SetPlayerNumberEvent>(ChessEvents.SetPlayerNumber);
        setPlayerNumberEvent.data.player = player;
        setPlayerNumberEvent.data.number = playerNumber;
        this._system.broadcastEvent(ChessEvents.SetPlayerNumber, setPlayerNumberEvent);
    }

    processPlayerSelect(player: IEntity, attackedEntity: IEntity) {
        if (this._game.isComplete) {
            return;
        }

        const expectedPlayer = this._game.players[this._game.currentPlayerColour === PieceColour.White ? 0 : 1];
        if (expectedPlayer.id !== player.id) {
            const displayChatEvent = this._system.createEventData(SendToMinecraftServer.DisplayChat);
            displayChatEvent.data.message = `It is not your turn`;
            this._system.broadcastEvent(SendToMinecraftServer.DisplayChat, displayChatEvent);
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
                    const displayChatEvent = this._system.createEventData(SendToMinecraftServer.DisplayChat);
                    displayChatEvent.data.message = `Cannot select ${chessPiece.type} at ${boardPosition.x},${boardPosition.z} belongs to ${chessPiece.colour}`;
                    this._system.broadcastEvent(SendToMinecraftServer.DisplayChat, displayChatEvent);
                    return;
                };
                //Now let's make sure that the piece can actually do something.
                if (attackedPiece.availableMoves.length === 0) {
                    const displayChatEvent = this._system.createEventData(SendToMinecraftServer.DisplayChat);
                    displayChatEvent.data.message = `Cannot select ${chessPiece.type} at ${boardPosition.x},${boardPosition.z} there are no moves available`;
                    this._system.broadcastEvent(SendToMinecraftServer.DisplayChat, displayChatEvent);
                    return;
                };
                //If we got this far, we have an entity we can select, so let's start tracking it
                const displayChatEvent = this._system.createEventData(SendToMinecraftServer.DisplayChat);
                displayChatEvent.data.message = `Selected ${chessPiece.colour} ${chessPiece.type} at ${boardPosition.x},${boardPosition.z}`;
                this._system.broadcastEvent(SendToMinecraftServer.DisplayChat, displayChatEvent);
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
                    const displayChatEvent = this._system.createEventData(SendToMinecraftServer.DisplayChat);
                    displayChatEvent.data.message = `Cancelled move for ${chessPiece.type} at ${boardPosition.x},${boardPosition.z}`;
                    this._system.broadcastEvent(SendToMinecraftServer.DisplayChat, displayChatEvent);
                    return;
                }

                //The player has chosen to attacking a piece
                //First make sure they're not attacking their own piece.
                //FIXME: This is where we would need something special in here to allow castling
                if (chessPiece.colour === this._game.currentPlayerColour) {
                    const displayChatEvent = this._system.createEventData(SendToMinecraftServer.DisplayChat);
                    displayChatEvent.data.message = `Cannot attack ${chessPiece.type} at ${boardPosition.x},${boardPosition.z} belongs to you`;
                    this._system.broadcastEvent(SendToMinecraftServer.DisplayChat, displayChatEvent);
                    return;
                }

                //Checks passed? Ok, let's attack!
                const displayChatEvent = this._system.createEventData(SendToMinecraftServer.DisplayChat);
                displayChatEvent.data.message = `Attacking ${chessPiece.colour} ${chessPiece.type} at ${boardPosition.x},${boardPosition.z}`
                this._system.broadcastEvent(SendToMinecraftServer.DisplayChat, displayChatEvent);
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
                const displayChatEvent = this._system.createEventData(SendToMinecraftServer.DisplayChat);
                displayChatEvent.data.message = `Moving piece to ${boardPosition.x},${boardPosition.z}`;
                this._system.broadcastEvent(SendToMinecraftServer.DisplayChat, displayChatEvent);
                const previousPiecePosition: VectorXZ = {x: this._game.selectedPiece.boardPosition.x, z: this._game.selectedPiece.boardPosition.z}
                //Move the selected piece to the marker's location
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

        const pieces = this._game.findPiecesByType(this._game.currentPlayerColour, Piece.King);
        if (pieces.length !== 0) {
            //Should always be the case. don't allow players to actually kill the king.
            const king = pieces[0];

            const kingState = this._moveManager.isKingInCheck(king, king.boardPosition);
            if (kingState === KingState.CheckMate) {
                this._game.isComplete = true;
                const displayChatEvent = this._system.createEventData(SendToMinecraftServer.DisplayChat);
                displayChatEvent.data.message = `${previousPlayerColour} has won the game`;
                this._system.broadcastEvent(SendToMinecraftServer.DisplayChat, displayChatEvent);
                return;
            }
        }

        const displayChatEvent = this._system.createEventData(SendToMinecraftServer.DisplayChat);
        displayChatEvent.data.message = `It is now ${this._game.currentPlayerColour}'s turn`;
        this._system.broadcastEvent(SendToMinecraftServer.DisplayChat, displayChatEvent);
    }

    addPlayer(player: IEntity) {
        this._game.players.push(player);

        this.setPlayerNumber(player, this._game.players.length);
        return this._game.players.length
    }
}