export type EntityKindV2 =
  | "wall"
  | "opening"
  | "balcony"
  | "slab"
  | "roof"
  | "stair"
  | "storey";

export class EntityNotFoundError extends Error {
  constructor(kind: EntityKindV2, id: string) {
    super(`${kind} not found: ${id}`);
    this.name = "EntityNotFoundError";
  }
}

export class EntityRangeError extends Error {
  constructor(field: string, message: string) {
    super(`${field}: ${message}`);
    this.name = "EntityRangeError";
  }
}

export class EntityStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EntityStateError";
  }
}
