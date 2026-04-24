const Fastify = require('fastify');
const Logger = require('../../utils/Logger');

class ApiServer {
    /**
     * @param {object} options
     * @param {number} [options.port=3000]
     * @param {string|null} [options.apiKey=null] - Bearer token required on protected routes
     */
    constructor({ port = 3000, apiKey = null } = {}) {
        this.port = port;
        this.apiKey = apiKey;
        this.fastify = Fastify({ logger: false });

        this._setupAuth();
        this._registerHealthRoute();
    }

    /**
     * Add a global preHandler that enforces Bearer token on routes
     * that have { config: { auth: true } } (the default).
     */
    _setupAuth() {
        this.fastify.addHook('preHandler', async (request, reply) => {
            const config = request.routeOptions?.config ?? {};
            if (!config.auth) return; // public route, skip

            if (!this.apiKey) {
                // API key not configured — deny all protected routes
                return reply.code(503).send({ error: 'API authentication is not configured' });
            }

            const header = request.headers['authorization'];
            if (!header || !header.startsWith('Bearer ')) {
                return reply.code(401).send({ error: 'Missing or malformed Authorization header' });
            }

            const token = header.slice(7);
            if (token !== this.apiKey) {
                return reply.code(403).send({ error: 'Forbidden' });
            }
        });
    }

    /**
     * Built-in public health endpoint — always registered, no auth.
     */
    _registerHealthRoute() {
        this.fastify.get('/health', { config: { auth: false } }, async () => {
            return { status: 'ok', timestamp: new Date().toISOString() };
        });
    }

    /**
     * Register an API route.
     * Called by modules/commands via ModuleManager.registerApiRoute().
     *
     * @param {object} options
     * @param {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} options.method
     * @param {string} options.path          - Route path, e.g. '/api/mymodule/status'
     * @param {Function} options.handler     - async (request, reply) => any
     * @param {boolean} [options.auth=true]  - Require Bearer token auth
     * @param {object} [options.schema]      - Optional Fastify JSON schema for validation/docs
     */
    route({ method, path, handler, auth = true, schema = undefined }) {
        const routeOptions = {
            method: method.toUpperCase(),
            url: path,
            config: { auth },
            handler
        };
        if (schema) routeOptions.schema = schema;

        try {
            this.fastify.route(routeOptions);
            Logger.debug(`API route registered: ${method.toUpperCase()} ${path}`);
        } catch (error) {
            Logger.error(`Failed to register API route ${method.toUpperCase()} ${path}: ${error.message}`);
        }
    }

    /**
     * Start listening. Call after all routes have been registered.
     */
    async start() {
        try {
            await this.fastify.listen({ port: this.port, host: '0.0.0.0' });
            Logger.success(`API server listening on port ${this.port}`);
        } catch (error) {
            Logger.error(`Failed to start API server: ${error.message}`);
            throw error;
        }
    }

    /**
     * Gracefully shut down the server.
     */
    async stop() {
        try {
            await this.fastify.close();
            Logger.info('API server stopped');
        } catch (error) {
            Logger.warn(`Error stopping API server: ${error.message}`);
        }
    }
}

module.exports = ApiServer;
