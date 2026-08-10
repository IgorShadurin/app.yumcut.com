import { describe, expect, it } from 'vitest';
import { userApiOpenApiSpec } from '@/server/user-api/openapi';
import * as openapiRoute from '@/app/api/user/v1/openapi.json/route';
import * as docsRoute from '@/app/api/user/v1/docs/route';

describe('user API OpenAPI spec', () => {
  it('documents bearer authentication and the user API base path', () => {
    expect(userApiOpenApiSpec.servers[0]?.url).toBe('/api/user/v1');
    expect(userApiOpenApiSpec.components.securitySchemes.BearerAuth).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
  });

  it('documents idempotency on project-creating and costly write operations', () => {
    const createProject = userApiOpenApiSpec.paths['/projects'].post;
    const regenerateImage = userApiOpenApiSpec.paths['/projects/{projectId}/images/regenerate'].post;

    expect(createProject.parameters).toContainEqual(expect.objectContaining({
      name: 'Idempotency-Key',
      in: 'header',
      required: true,
    }));
    expect(regenerateImage.parameters).toContainEqual(expect.objectContaining({
      name: 'Idempotency-Key',
      in: 'header',
      required: true,
    }));
    expect(createProject.responses).toHaveProperty('409');
  });

  it('documents provider-aware image generation prompt limits', () => {
    const prompt = userApiOpenApiSpec.components.schemas.ProjectCreate.properties.prompt;

    expect(prompt.description).toContain('3,000 characters for standalone images');
    expect(prompt.description).toContain('1,796 characters when imagePrank is supplied');
  });

  it('does not expose billing, account deletion, or admin paths', () => {
    const paths = Object.keys(userApiOpenApiSpec.paths);
    expect(paths.some((path) => path.includes('subscription'))).toBe(false);
    expect(paths.some((path) => path.includes('billing'))).toBe(false);
    expect(paths.some((path) => path.includes('delete-account'))).toBe(false);
    expect(paths.some((path) => path.startsWith('/admin'))).toBe(false);
  });

  it('documents catalog preview and info reads for image pranks, characters, and story templates', () => {
    expect(userApiOpenApiSpec.paths['/image-pranks'].get.responses[200]).toMatchObject({
      description: 'Image Prank catalog',
    });
    expect(userApiOpenApiSpec.paths['/image-pranks/{slug}'].get.parameters).toContainEqual(expect.objectContaining({
      name: 'slug',
      in: 'path',
    }));
    expect(userApiOpenApiSpec.paths['/image-pranks/{slug}'].get.responses[200]).toMatchObject({
      description: 'Image Prank item',
      content: {
        'application/json': {
          schema: {
            properties: {
              previewImageUrl: expect.objectContaining({
                description: 'Display-safe preview image URL.',
              }),
            },
          },
        },
      },
    });

    expect(userApiOpenApiSpec.paths['/characters/catalog'].get.responses[200]).toMatchObject({
      description: 'Character catalog',
    });
    expect(userApiOpenApiSpec.paths['/characters/{slug}'].get.responses[200]).toMatchObject({
      content: {
        'application/json': {
          schema: {
            properties: {
              previewImageUrl: { type: 'string' },
              previewVideoUrl: { type: ['string', 'null'] },
            },
          },
        },
      },
    });
    expect(userApiOpenApiSpec.paths['/characters/variations/{variationId}/preview-image'].get.parameters).toContainEqual(expect.objectContaining({
      name: 'h',
      in: 'query',
      required: true,
    }));
    expect(userApiOpenApiSpec.paths['/characters/variations/{variationId}/preview-image'].get.responses).toHaveProperty('307');

    expect(userApiOpenApiSpec.paths['/templates'].get.description).toContain('previewImageUrl');
    expect(userApiOpenApiSpec.paths['/templates/{id}'].get.responses[200]).toMatchObject({
      content: {
        'application/json': {
          schema: {
            properties: {
              previewImageUrl: { type: ['string', 'null'] },
              previewVideoUrl: { type: ['string', 'null'] },
            },
          },
        },
      },
    });
  });

  it('serves the OpenAPI JSON route without authentication', async () => {
    const res = openapiRoute.GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body.info.title).toBe('YumCut User API');
    expect(body.paths['/projects'].post.parameters).toContainEqual(expect.objectContaining({
      name: 'Idempotency-Key',
      required: true,
    }));
  });

  it('serves Scalar API documentation pointed at the OpenAPI route', async () => {
    const res = docsRoute.GET();
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('YumCut User API');
    expect(html).toContain('/api/user/v1/openapi.json');
  });
});
