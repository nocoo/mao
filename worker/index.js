/**
 * @typedef {{ ASSETS: { fetch: (request: Request) => Promise<Response> } }} WorkerEnv
 */

export default {
  /**
   * @param {Request} request
   * @param {WorkerEnv} env
   * @returns {Promise<Response>}
   */
  fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
