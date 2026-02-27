/**
 * Client for AscendAPI Exercise DB (RapidAPI).
 */
class ExerciseApiClient {
  /**
   * @param {{
   *  baseUrl?: string,
   *  apiVersion?: string,
   *  rapidApiKey?: string,
   *  rapidApiHost?: string,
   *  defaultHeaders?: Record<string, string>
   * }} [options]
   */
  constructor(options = {}) {
    const {
      baseUrl = "https://edb-with-videos-and-images-by-ascendapi.p.rapidapi.com",
      apiVersion = "/api/v1",
      rapidApiKey,
      rapidApiHost,
      defaultHeaders = {},
    } = options;

    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiPrefix = (apiVersion || "/api/v1").startsWith("/")
      ? apiVersion || "/api/v1"
      : `/${apiVersion}`;
    this.rapidApiKey = rapidApiKey;
    this.rapidApiHost = rapidApiHost || new URL(this.baseUrl).host;

    this.defaultHeaders = {
      Accept: "application/json",
      ...defaultHeaders,
    };
  }

  /** @returns {Promise<any>} */
  getServerStatus() {
    return this.#request("/liveness");
  }

  /**
   * GET /api/v1/exercises/search
   * @param {{ search?: string }} [params]
   */
  searchExercises(params = {}) {
    return this.#request(`/exercises/search${this.#toQueryString(params)}`);
  }

  /** @param {string} exerciseId */
  getExerciseById(exerciseId) {
    if (!exerciseId) throw new Error("exerciseId is required");
    return this.#request(`/exercises/${encodeURIComponent(exerciseId)}`);
  }

  /**
   * GET /api/v1/exercises
   * @param {Record<string, string | number | boolean | undefined | null>} [params]
   */
  getExercises(params = {}) {
    return this.#request(`/exercises${this.#toQueryString(params)}`);
  }

  /**
   * Fetches all workouts by paging through GET /exercises.
   * Defaults are conservative and can be overridden.
   *
   * @param {{ limit?: number, offset?: number, maxPages?: number, [key: string]: any }} [options]
   * @returns {Promise<any[]>}
   */
  async getAllWorkouts(options = {}) {
    const { limit = 100, offset = 0, maxPages = 100, ...filters } = options;

    const all = [];
    let currentOffset = offset;

    for (let page = 0; page < maxPages; page += 1) {
      const response = await this.getExercises({
        ...filters,
        limit,
        offset: currentOffset,
      });

      const rows = Array.isArray(response)
        ? response
        : Array.isArray(response?.data)
          ? response.data
          : Array.isArray(response?.results)
            ? response.results
            : [];

      if (!rows.length) break;

      all.push(...rows);
      if (rows.length < limit) break;
      currentOffset += limit;
    }

    return all;
  }

  /** @returns {Promise<any>} */
  getAllMuscles() {
    return this.#request("/muscles");
  }

  /** @returns {Promise<any>} */
  getAllBodyparts() {
    return this.#request("/bodyparts");
  }

  /** @returns {Promise<any>} */
  getAllEquipments() {
    return this.#request("/equipments");
  }

  /** @returns {Promise<any>} */
  getAllExerciseTypes() {
    return this.#request("/exercisetypes");
  }

  /**
   * Build a client from environment variables.
   * - EXERCISE_API_BASE_URL
   * - EXERCISE_API_VERSION
   * - RAPIDAPI_KEY
   * - RAPIDAPI_HOST
   */
  static fromEnv() {
    return new ExerciseApiClient({
      baseUrl: process.env.EXERCISE_API_BASE_URL,
      apiVersion: process.env.EXERCISE_API_VERSION,
      rapidApiKey: process.env.RAPIDAPI_KEY,
      rapidApiHost: process.env.RAPIDAPI_HOST,
    });
  }

  /**
   * @param {string} path
   * @param {RequestInit} [init]
   */
  async #request(path, init = {}) {
    const headers = {
      ...this.defaultHeaders,
      ...(init.headers || {}),
    };

    if (this.rapidApiKey) headers["x-rapidapi-key"] = this.rapidApiKey;
    if (this.rapidApiHost) headers["x-rapidapi-host"] = this.rapidApiHost;

    const response = await fetch(`${this.baseUrl}${this.apiPrefix}${path}`, {
      ...init,
      method: init.method || "GET",
      headers,
    });

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const error = new Error(`Exercise API request failed (${response.status})`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  }

  /**
   * @param {Record<string, any>} params
   * @returns {string}
   */
  #toQueryString(params) {
    const searchParams = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === "") continue;
      searchParams.append(key, String(value));
    }

    const query = searchParams.toString();
    return query ? `?${query}` : "";
  }
}

module.exports = { ExerciseApiClient };
