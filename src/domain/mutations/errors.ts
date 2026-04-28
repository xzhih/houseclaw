import type { ObjectSelectionKind } from "../selection";

export class EntityNotFoundError extends Error {
  constructor(public kind: ObjectSelectionKind, public id: string) {
    super(`${kind} ${id} not found`);
    this.name = "EntityNotFoundError";
  }
}

export class EntityRangeError extends Error {
  constructor(public field: string, message: string) {
    super(message);
    this.name = "EntityRangeError";
  }
}

export class EntityStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EntityStateError";
  }
}
