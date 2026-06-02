const swaggerJsdoc = require('swagger-jsdoc');
const config = require('./config');

const servers = [
  {
    url: `http://localhost:${config.app.port}`,
    description: 'Local development server'
  }
];

if (config.app.publicUrl) {
  servers.unshift({
    url: config.app.publicUrl,
    description: 'Public tunnel server'
  });
}

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: config.swagger.title,
      version: '1.0.0',
      description: config.swagger.description,
    },
    servers,
    security: [
      {
        BearerAuth: []
      }
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    }
  },
  apis: ['./src/routes/*.js']
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
