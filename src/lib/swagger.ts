export const swaggerSpec = {
    openapi: '3.0.3',
    info: {
      title: 'Nexus API',
      version: '1.0.0',
      description:
        'AI-Enhanced Team Knowledge Hub — real-time workspaces with semantic search powered by pgvector and LLM-driven RAG.',
      contact: { email: 'singhharsh0475@gmail.com' },
    },
    servers: [
      { url: '/api', description: 'Current environment' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Access token from /auth/login or /auth/refresh',
        },
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'access_token',
          description: 'Access token set as httpOnly cookie after login',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            details: { type: 'array', items: { type: 'object' } },
          },
          required: ['error'],
        },
        Workspace: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            slug: { type: 'string' },
            created_by: { type: 'string', format: 'uuid' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        Post: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            workspace_id: { type: 'string', format: 'uuid' },
            author_id: { type: 'string', format: 'uuid' },
            title: { type: 'string', nullable: true },
            content: { type: 'string' },
            embedding_status: { type: 'string', enum: ['pending', 'processing', 'completed', 'failed'] },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        Member: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string', format: 'uuid' },
            email: { type: 'string', nullable: true },
            role: { type: 'string', enum: ['admin', 'member', 'viewer'] },
            joined_at: { type: 'string', format: 'date-time' },
          },
        },
        Webhook: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            workspace_id: { type: 'string', format: 'uuid' },
            url: { type: 'string', format: 'uri' },
            events: { type: 'array', items: { type: 'string', enum: ['post.created', 'member.joined', 'query.completed'] } },
            active: { type: 'boolean' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        WebhookDelivery: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            webhook_id: { type: 'string', format: 'uuid' },
            event_type: { type: 'string' },
            payload: { type: 'object' },
            status: { type: 'string', enum: ['pending', 'delivered', 'failed'] },
            attempts: { type: 'integer' },
            last_attempt_at: { type: 'string', format: 'date-time', nullable: true },
            response_status: { type: 'integer', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        HealthCheck: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
            version: { type: 'string' },
            uptime_seconds: { type: 'number' },
            checks: {
              type: 'object',
              properties: {
                database: { type: 'object', properties: { status: { type: 'string' }, latency_ms: { type: 'number' } } },
                redis: { type: 'object', properties: { status: { type: 'string' }, latency_ms: { type: 'number' } } },
                worker: { type: 'object', properties: { status: { type: 'string' } } },
              },
            },
          },
        },
        RAGSource: {
          type: 'object',
          properties: {
            postId: { type: 'string', format: 'uuid' },
            chunkId: { type: 'string' },
            content: { type: 'string' },
            similarity: { type: 'number' },
            title: { type: 'string' },
          },
        },
      },
      parameters: {
        WorkspaceId: {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'Workspace UUID',
        },
        CorrelationId: {
          name: 'X-Request-ID',
          in: 'header',
          required: false,
          schema: { type: 'string', format: 'uuid' },
          description: 'Correlation ID for request tracing (auto-generated if not provided)',
        },
      },
      responses: {
        Unauthorized: { description: 'Missing or invalid authentication token', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        Forbidden: { description: 'Insufficient role — admin access required', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    },
    security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Authentication and token management' },
      { name: 'Workspaces', description: 'Workspace CRUD operations' },
      { name: 'Members', description: 'Workspace member management' },
      { name: 'Posts', description: 'Workspace post management' },
      { name: 'Query', description: 'AI-powered semantic search (RAG)' },
      { name: 'Webhooks', description: 'Webhook registration and delivery logs' },
      { name: 'Health', description: 'System health check' },
    ],
    paths: {
      '/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Login with email and password',
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password'],
                  properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 1 },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Login successful — sets httpOnly cookies',
              content: { 'application/json': { schema: { type: 'object', properties: { user: { type: 'object' }, expires_at: { type: 'number' } } } } },
            },
            '401': { description: 'Invalid credentials', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/auth/logout': {
        post: {
          tags: ['Auth'],
          summary: 'Logout and clear auth cookies',
          responses: {
            '200': { description: 'Logged out successfully' },
          },
        },
      },
      '/auth/refresh': {
        post: {
          tags: ['Auth'],
          summary: 'Refresh access token using refresh token cookie',
          security: [],
          responses: {
            '200': {
              description: 'New token pair issued',
              content: { 'application/json': { schema: { type: 'object', properties: { expires_at: { type: 'number' } } } } },
            },
            '401': { description: 'Invalid or expired refresh token', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/auth/callback': {
        get: {
          tags: ['Auth'],
          summary: 'OAuth callback handler (Supabase Auth)',
          security: [],
          parameters: [{ name: 'code', in: 'query', required: true, schema: { type: 'string' } }],
          responses: {
            '302': { description: 'Redirects to dashboard after exchanging code' },
            '400': { description: 'Missing or invalid code' },
          },
        },
      },
      '/workspaces': {
        get: {
          tags: ['Workspaces'],
          summary: 'List workspaces the authenticated user belongs to',
          parameters: [{ $ref: '#/components/parameters/CorrelationId' }],
          responses: {
            '200': {
              description: 'List of workspaces with user role',
              content: { 'application/json': { schema: { type: 'array', items: { allOf: [{ $ref: '#/components/schemas/Workspace' }, { type: 'object', properties: { role: { type: 'string' } } }] } } } },
            },
            '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
        post: {
          tags: ['Workspaces'],
          summary: 'Create a new workspace',
          parameters: [{ $ref: '#/components/parameters/CorrelationId' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'slug'],
                  properties: {
                    name: { type: 'string', minLength: 1, maxLength: 100 },
                    slug: { type: 'string', minLength: 2, maxLength: 50, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Workspace created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Workspace' } } } },
            '400': { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '409': { description: 'Slug already exists', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/workspaces/{id}': {
        get: {
          tags: ['Workspaces'],
          summary: 'Get workspace details with members and post count',
          parameters: [{ $ref: '#/components/parameters/WorkspaceId' }, { $ref: '#/components/parameters/CorrelationId' }],
          responses: {
            '200': { description: 'Workspace details', content: { 'application/json': { schema: { $ref: '#/components/schemas/Workspace' } } } },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
        patch: {
          tags: ['Workspaces'],
          summary: 'Update workspace name or slug (admin only)',
          parameters: [{ $ref: '#/components/parameters/WorkspaceId' }, { $ref: '#/components/parameters/CorrelationId' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', minLength: 1, maxLength: 100 },
                    slug: { type: 'string', minLength: 2, maxLength: 50 },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Workspace updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/Workspace' } } } },
            '400': { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
            '409': { description: 'Slug conflict', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
        delete: {
          tags: ['Workspaces'],
          summary: 'Delete a workspace (admin only)',
          parameters: [{ $ref: '#/components/parameters/WorkspaceId' }, { $ref: '#/components/parameters/CorrelationId' }],
          responses: {
            '200': { description: 'Workspace deleted' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
          },
        },
      },
      '/workspaces/{id}/members': {
        get: {
          tags: ['Members'],
          summary: 'List workspace members',
          parameters: [{ $ref: '#/components/parameters/WorkspaceId' }, { $ref: '#/components/parameters/CorrelationId' }],
          responses: {
            '200': { description: 'List of members', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Member' } } } } },
            '401': { $ref: '#/components/responses/Unauthorized' },
          },
        },
        post: {
          tags: ['Members'],
          summary: 'Invite a member to the workspace (admin only)',
          parameters: [{ $ref: '#/components/parameters/WorkspaceId' }, { $ref: '#/components/parameters/CorrelationId' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email'],
                  properties: {
                    email: { type: 'string', format: 'email' },
                    role: { type: 'string', enum: ['admin', 'member', 'viewer'], default: 'member' },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Member invited', content: { 'application/json': { schema: { $ref: '#/components/schemas/Member' } } } },
            '400': { description: 'Validation error' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
            '404': { description: 'User not found' },
            '409': { description: 'User already a member' },
          },
        },
      },
      '/workspaces/{id}/members/{userId}': {
        patch: {
          tags: ['Members'],
          summary: 'Update member role (admin only)',
          parameters: [
            { $ref: '#/components/parameters/WorkspaceId' },
            { name: 'userId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Target user UUID' },
            { $ref: '#/components/parameters/CorrelationId' },
          ],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['role'], properties: { role: { type: 'string', enum: ['admin', 'member', 'viewer'] } } } } },
          },
          responses: {
            '200': { description: 'Role updated' },
            '400': { description: 'Cannot demote the last admin' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
          },
        },
        delete: {
          tags: ['Members'],
          summary: 'Remove member from workspace (admin only)',
          parameters: [
            { $ref: '#/components/parameters/WorkspaceId' },
            { name: 'userId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            { $ref: '#/components/parameters/CorrelationId' },
          ],
          responses: {
            '200': { description: 'Member removed' },
            '400': { description: 'Cannot remove the last admin' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
          },
        },
      },
      '/workspaces/{id}/posts': {
        get: {
          tags: ['Posts'],
          summary: 'List posts in a workspace (cursor-paginated)',
          parameters: [
            { $ref: '#/components/parameters/WorkspaceId' },
            { name: 'cursor', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Pagination cursor (created_at of last item)' },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
            { $ref: '#/components/parameters/CorrelationId' },
          ],
          responses: {
            '200': {
              description: 'Paginated posts',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: { type: 'array', items: { $ref: '#/components/schemas/Post' } },
                      next_cursor: { type: 'string', nullable: true },
                      has_more: { type: 'boolean' },
                    },
                  },
                },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
          },
        },
        post: {
          tags: ['Posts'],
          summary: 'Create a post (auto-enqueues embedding)',
          parameters: [{ $ref: '#/components/parameters/WorkspaceId' }, { $ref: '#/components/parameters/CorrelationId' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['content'],
                  properties: {
                    title: { type: 'string', maxLength: 300 },
                    content: { type: 'string', minLength: 1, maxLength: 50000 },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Post created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Post' } } } },
            '400': { description: 'Validation error' },
            '401': { $ref: '#/components/responses/Unauthorized' },
          },
        },
      },
      '/workspaces/{id}/posts/{postId}': {
        get: {
          tags: ['Posts'],
          summary: 'Get a single post by ID',
          parameters: [
            { $ref: '#/components/parameters/WorkspaceId' },
            { name: 'postId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            { $ref: '#/components/parameters/CorrelationId' },
          ],
          responses: {
            '200': { description: 'Post details', content: { 'application/json': { schema: { $ref: '#/components/schemas/Post' } } } },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '404': { description: 'Not found' },
          },
        },
        delete: {
          tags: ['Posts'],
          summary: 'Delete a post (author or admin)',
          parameters: [
            { $ref: '#/components/parameters/WorkspaceId' },
            { name: 'postId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            { $ref: '#/components/parameters/CorrelationId' },
          ],
          responses: {
            '200': { description: 'Post deleted' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { description: 'Forbidden' },
            '404': { description: 'Not found' },
          },
        },
      },
      '/workspaces/{id}/query': {
        post: {
          tags: ['Query'],
          summary: 'Semantic search with streamed RAG response (SSE)',
          description: 'Sends a natural-language query against workspace posts. Returns a Server-Sent Events stream with sources, answer deltas, and a done event. Rate limited to 20 queries per user per hour.',
          parameters: [{ $ref: '#/components/parameters/WorkspaceId' }, { $ref: '#/components/parameters/CorrelationId' }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['query'], properties: { query: { type: 'string', minLength: 1, maxLength: 2000 } } } } },
          },
          responses: {
            '200': {
              description: 'SSE stream of RAG events',
              content: {
                'text/event-stream': {
                  schema: {
                    type: 'string',
                    description: 'Events: {type:"sources",sources:[...]}, {type:"delta",content:"..."}, {type:"done",cached:bool,latencyMs:number}, {type:"error",message:"..."}',
                  },
                },
              },
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '429': { description: 'Rate limit exceeded', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/workspaces/{id}/webhooks': {
        get: {
          tags: ['Webhooks'],
          summary: 'List webhooks for a workspace',
          parameters: [{ $ref: '#/components/parameters/WorkspaceId' }, { $ref: '#/components/parameters/CorrelationId' }],
          responses: {
            '200': { description: 'List of webhooks', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Webhook' } } } } } } },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
          },
        },
        post: {
          tags: ['Webhooks'],
          summary: 'Register a new webhook',
          parameters: [{ $ref: '#/components/parameters/WorkspaceId' }, { $ref: '#/components/parameters/CorrelationId' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['url', 'events', 'secret'],
                  properties: {
                    url: { type: 'string', format: 'uri' },
                    events: { type: 'array', items: { type: 'string', enum: ['post.created', 'member.joined', 'query.completed'] }, minItems: 1 },
                    secret: { type: 'string', minLength: 16, maxLength: 256 },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Webhook created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Webhook' } } } },
            '400': { description: 'Validation error' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
          },
        },
      },
      '/workspaces/{id}/webhooks/{webhookId}': {
        patch: {
          tags: ['Webhooks'],
          summary: 'Update a webhook (toggle active, change URL or events)',
          parameters: [
            { $ref: '#/components/parameters/WorkspaceId' },
            { name: 'webhookId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            { $ref: '#/components/parameters/CorrelationId' },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    url: { type: 'string', format: 'uri' },
                    events: { type: 'array', items: { type: 'string' } },
                    active: { type: 'boolean' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Webhook updated' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
            '404': { description: 'Not found' },
          },
        },
        delete: {
          tags: ['Webhooks'],
          summary: 'Delete a webhook',
          parameters: [
            { $ref: '#/components/parameters/WorkspaceId' },
            { name: 'webhookId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            { $ref: '#/components/parameters/CorrelationId' },
          ],
          responses: {
            '200': { description: 'Webhook deleted' },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
            '404': { description: 'Not found' },
          },
        },
      },
      '/workspaces/{id}/webhooks/{webhookId}/deliveries': {
        get: {
          tags: ['Webhooks'],
          summary: 'List delivery attempts for a webhook',
          parameters: [
            { $ref: '#/components/parameters/WorkspaceId' },
            { name: 'webhookId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
            { $ref: '#/components/parameters/CorrelationId' },
          ],
          responses: {
            '200': { description: 'List of deliveries', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/WebhookDelivery' } } } } } } },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
          },
        },
      },
      '/health': {
        get: {
          tags: ['Health'],
          summary: 'System health check',
          security: [],
          responses: {
            '200': { description: 'Healthy or degraded (check status field in body)', content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthCheck' } } } },
            '503': { description: 'Unhealthy — two or more checks down', content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthCheck' } } } },
          },
        },
      },
    },
};
