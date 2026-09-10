import type { ParsePointer } from '@/types/parse';
import { getParse } from './client';

/**
 * Mirrors the queryParams vocabulary the rest of the platform uses
 * (switch-dashboard/src/api/modules/objects.js, and switch-finance's copy of it) — an
 * array of single-key filter objects — so this reads familiar to anyone coming from
 * those apps. Extend the union as new query shapes are needed.
 *
 * `{}` is a member on purpose: the callers here build their param list as one flat
 * array of ternaries (`filter ? {equalTo: …} : {}`), exactly as switch-dashboard does,
 * and an empty object is how a branch says "no constraint" without breaking the array up.
 */
export type QueryParam =
  | Record<string, never>
  | { equalTo: { key: string; value: unknown } }
  | { notEqualTo: { key: string; value: unknown } }
  | { startsWith: { key: string; value: string } }
  | { matches: { key: string; value: string; modifiers?: string } }
  | { containedIn: { key: string; value: unknown[] } }
  | { exists: string }
  | { doesNotExist: string }
  | { include: string }
  | { select: string | string[] }
  | { limit: number }
  | { skip: number }
  | { ascending: string }
  | { descending: string }
  | { addAscending: string }
  | { addDescending: string }
  | { greaterThan: { key: string; value: unknown } }
  | { lessThan: { key: string; value: unknown } }
  | { greaterThanOrEqualTo: { key: string; value: unknown } }
  | { lessThanOrEqualTo: { key: string; value: unknown } };

function newQuery(collection: string) {
  const ParseQuery = getParse().Query;
  return new ParseQuery(collection);
}

function applyParams(query: ReturnType<typeof newQuery>, params: QueryParam[]): void {
  for (const param of params) {
    if ('equalTo' in param) query.equalTo(param.equalTo.key, param.equalTo.value);
    else if ('notEqualTo' in param) query.notEqualTo(param.notEqualTo.key, param.notEqualTo.value);
    else if ('startsWith' in param) {
      query.startsWith(param.startsWith.key, escapeRegex(param.startsWith.value));
    } else if ('matches' in param) {
      query.matches(param.matches.key, escapeRegex(param.matches.value), param.matches.modifiers);
    } else if ('containedIn' in param) {
      query.containedIn(param.containedIn.key, param.containedIn.value);
    } else if ('exists' in param) query.exists(param.exists);
    else if ('doesNotExist' in param) query.doesNotExist(param.doesNotExist);
    else if ('include' in param) query.include(param.include);
    else if ('select' in param) query.select(param.select);
    else if ('limit' in param) query.limit(param.limit);
    else if ('skip' in param) query.skip(param.skip);
    else if ('ascending' in param) query.ascending(param.ascending);
    else if ('descending' in param) query.descending(param.descending);
    else if ('addAscending' in param) query.addAscending(param.addAscending);
    else if ('addDescending' in param) query.addDescending(param.addDescending);
    else if ('greaterThan' in param) query.greaterThan(param.greaterThan.key, param.greaterThan.value);
    else if ('lessThan' in param) query.lessThan(param.lessThan.key, param.lessThan.value);
    else if ('greaterThanOrEqualTo' in param) {
      query.greaterThanOrEqualTo(param.greaterThanOrEqualTo.key, param.greaterThanOrEqualTo.value);
    } else if ('lessThanOrEqualTo' in param) {
      query.lessThanOrEqualTo(param.lessThanOrEqualTo.key, param.lessThanOrEqualTo.value);
    }
  }
}

// `startsWith` and `matches` both compile to a MongoDB regex server-side, and the search
// box feeds them a string typed by a human. Unescaped, that is both a crash risk
// (an unbalanced bracket is an invalid regex) and a ReDoS vector.
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Runs a `find` and returns every matching row as plain JSON. */
export async function find<T>(collection: string, params: QueryParam[] = []): Promise<T[]> {
  const query = newQuery(collection);
  applyParams(query, params);
  const results = await query.find();
  return results.map((item) => item.toJSON() as T);
}

export type PageResult<T> = { results: T[]; count: number };

/**
 * Runs a `find` that also returns the total row count for the same constraints, in **one
 * request** — Parse's `withCount`, as switch-dashboard uses it.
 *
 * Deliberately one call rather than switch-finance's separate `find` + `count`: this
 * console re-runs its list on a timer, and two round-trips per tick is twice the load
 * for a number that has to agree with the rows next to it anyway. Splitting them also
 * lets the count land a tick behind the page, which shows up as a pager that briefly
 * offers a page that isn't there.
 */
export async function findWithCount<T>(
  collection: string,
  params: QueryParam[] = [],
): Promise<PageResult<T>> {
  const query = newQuery(collection);
  applyParams(query, params);
  query.withCount(true);
  // Parse's own types still describe find() as returning an array; withCount(true)
  // changes the response to {results, count} and the SDK does not model that overload.
  const page = (await query.find()) as unknown as {
    results: { toJSON: () => unknown }[];
    count: number;
  };
  return {
    results: page.results.map((item) => item.toJSON() as T),
    count: page.count,
  };
}

/**
 * Runs a `first` and returns the row as plain JSON, or `null` if none matched.
 *
 * Deliberately not `Parse.Query#get(objectId)`: `get()` throws Parse error code 101 on
 * a missing object, the same code as an invalid login and (on this backend) a
 * permission-denied read — three unrelated meanings colliding on one code. Filtering by
 * objectId with `first()` instead turns "not found" into a plain `null` the caller can
 * branch on, no try/catch for an expected case.
 */
export async function findOne<T>(collection: string, params: QueryParam[] = []): Promise<T | null> {
  const query = newQuery(collection);
  applyParams(query, params);
  const result = await query.first();
  return result ? (result.toJSON() as T) : null;
}

/** Runs a `count` query. Used only where no rows are wanted alongside it (the pipeline
 * tallies) — otherwise prefer `findWithCount`. */
export async function count(collection: string, params: QueryParam[] = []): Promise<number> {
  const query = newQuery(collection);
  applyParams(query, params);
  return query.count();
}

/**
 * Builds the JSON pointer literal an `equalTo` on a relation expects — the web
 * equivalent of the platform's `getPointerFromId`
 * (switch-dashboard/src/api/modules/objects.js). A plain literal rather than a real
 * Parse.Object: the SDK passes an unknown object straight through to the request body,
 * so this is exactly what the server receives either way, and it keeps callers (and
 * their tests) free of the browser-only SDK singleton.
 */
export function pointer<ClassName extends string>(
  className: ClassName,
  objectId: string,
): ParsePointer<ClassName> {
  return { __type: 'Pointer', className, objectId };
}
