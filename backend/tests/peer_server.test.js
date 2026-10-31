const request = require('supertest');
const { app } = require('../server');

describe('TASK A6: Self-hosted PeerJS Signalling Server', () => {
  it('GET /peerjs returns the PeerServer JSON response with status 200', async () => {
    const res = await request(app).get('/peerjs');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toHaveProperty('name', 'PeerJS Server');
    expect(res.body).toHaveProperty('description');
    expect(res.body).toHaveProperty('website', 'https://peerjs.com/');
  });
});
