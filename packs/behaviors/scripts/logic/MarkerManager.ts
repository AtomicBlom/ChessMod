import { MarkerEntity, GamePieceEntity, MoveType, PieceColour, PossiblePieceMove, MarkerComponent, ChessComponents } from "../chess";
import { GameState } from "./GameState";
import { MARKER_ENTITY, gameYLevel } from "../constants";


export class MarkerManager {
    markers: MarkerEntity[] = [];

    constructor(private _system: IVanillaServerSystem, private _game: GameState) {
    }

    findMarkerById(id: number) {
        const locatedMarkers = this.markers.filter(p => p.entity.id === id);
        if (locatedMarkers.length == 0) return null;
        if (locatedMarkers.length > 1) {
            this._system.broadcastEvent(SendToMinecraftServer.DisplayChat, "Apparently more than marker was matched by ID... how...?");
        }
        return locatedMarkers[0];
    }

    removeMarkers() {
        for (let marker of this.markers) {
            this._system.destroyEntity(marker.entity);
        }
        this.markers.length = 0;
    }

    createMarkers(gamePieceEntity: GamePieceEntity) {
        for (let move of gamePieceEntity.availableMoves.filter(am => am.type !== MoveType.Guarding && am.type !== MoveType.Blocked)) {
            this.createMarker(move, gamePieceEntity.piece.colour);
        }
    }

    createMarker(move: PossiblePieceMove, colour: PieceColour): boolean {
        const worldPosition = this._game.getEntityWorldPosition(move.x, move.z);

        const entity = this._system.createEntity(EntityType.Entity, MARKER_ENTITY);
        const position = this._system.getComponent(entity, MinecraftComponent.Position);
        const rotation = this._system.getComponent(entity, MinecraftComponent.Rotation);
        const marker = this._system.createComponent<MarkerComponent>(entity, ChessComponents.Marker);

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

        this._system.applyComponentChanges(entity, position);
        this._system.applyComponentChanges(entity, rotation);
        this._system.applyComponentChanges(entity, marker);

        this.markers.push({
            entity: entity,
            type: "marker",
            boardPosition: marker.position,
        })

        return true;
    }
}