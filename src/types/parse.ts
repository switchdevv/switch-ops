/** A Parse pointer as it appears in `.toJSON()` output for a field that was NOT
 * `include`d in the query — className identifies the target collection, objectId
 * the row. An `include`d pointer instead comes back as a full nested object (see
 * RestaurantWithRelations in types/restaurant.ts), not this stub shape. */
export type ParsePointer<ClassName extends string = string> = {
  __type: 'Pointer';
  className: ClassName;
  objectId: string;
};

export type ParseGeoPointJSON = {
  __type: 'GeoPoint';
  latitude: number;
  longitude: number;
};

/** A Parse.Polygon as serialized by `.toJSON()`. Each pair is **[latitude, longitude]** —
 * the reverse of GeoJSON's [lng, lat], which is the order every map library wants, so
 * convert at the boundary rather than passing these through. */
export type ParsePolygonJSON = {
  __type: 'Polygon';
  coordinates: [number, number][];
};

/** A Parse.File as serialized by `.toJSON()`. `url` is absolute and directly
 * fetchable; `name` is the storage-side filename, rarely worth displaying. */
export type ParseFileJSON = {
  __type: 'File';
  name: string;
  url: string;
};

/** A nested Date field as `.toJSON()` serializes it. Note this shape is only for
 * nested fields — top-level `createdAt`/`updatedAt` come back as plain ISO strings
 * instead, which is why ParseObjectJSON below types them as `string`. */
export type ParseDateJSON = {
  __type: 'Date';
  iso: string;
};

/** Fields every Parse object carries regardless of class. Every other field on a
 * given class should be modeled as optional — Parse rows are sparse, and a field
 * that's merely unset must render as "no value", not crash on `undefined`. */
export type ParseObjectJSON = {
  objectId: string;
  createdAt: string;
  updatedAt: string;
};
