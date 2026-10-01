const express = require('express');
const { doc } = require('hugo-server');
const { protect, isAdmin } = require('../../core/middleware/auth');
const asyncHandler = require('../../core/asyncHandler');
const stations = require('./stations');
const blind = require('./blindTest');
const admin = require('./admin');

const router = express.Router();

// Anyone can view the room list; Listening requires logging in (test socket).
// Rooms provided by Hugo — only admins can create/edit/delete.
router.get('/stations', doc('Open 24/7 stations with the current song and listener count', {'returns': '{ stations }'}), asyncHandler(stations.listStations));
router.get('/blind', doc('Open blind-listening rooms', {'returns': '{ rooms }'}), asyncHandler(blind.listRooms));
router.get('/blind/results', doc('Blind-listening results (stats per quality pair)', {'returns': 'statistics'}), protect, isAdmin, asyncHandler(blind.results));

router.get('/admin', doc('All rooms (including hidden) plus form options', {'returns': '{ rooms, genres, categories }'}), protect, isAdmin, asyncHandler(admin.list));
router.post('/admin', doc('Create a room', {'body': {'kind': 'station | blind', 'name': '', 'tagline': '', 'colors': '[hex, hex]', 'allowRequests': '', 'rules': '{ groups, excludeGroups, categories, instrumental, calm, popular }'}, 'returns': 'Room'}), protect, isAdmin, asyncHandler(admin.create));
router.post('/admin/preview', doc('Preview selection rules: matching song count and samples', {'body': {'rules': ''}, 'returns': '{ count, sample }'}), protect, isAdmin, asyncHandler(admin.preview));
router.patch('/admin/:id', doc('Edit a room (applies immediately to current listeners)', {'body': {'name': '', 'tagline': '', 'colors': '', 'active': '', 'allowRequests': '', 'rules': '', 'pinned': 'songId[] — songs pinned by the admin'}, 'returns': 'Room'}), protect, isAdmin, asyncHandler(admin.update));
router.delete('/admin/:id', doc('Delete a room (disconnects current listeners)', {'returns': '{ ok }'}), protect, isAdmin, asyncHandler(admin.remove));
router.get('/admin/:id/songs', doc('Songs pinned to the station by the admin', {'returns': '{ songs }'}), protect, isAdmin, asyncHandler(admin.pinnedSongs));
router.get('/admin/:id/suggestions', doc('Suggest songs for the station (by its rules) or search the catalog', {'query': {'q': 'search by title / artist (optional)'}, 'returns': '{ songs, matchedRules }'}), protect, isAdmin, asyncHandler(admin.suggestions));
router.get('/admin/:id/live', doc('Live station state: current song, queue, listeners', {'returns': '{ now, queue, listeners }'}), protect, isAdmin, asyncHandler(admin.live));
router.post('/admin/:id/queue', doc('Queue a song right after the current one', {'body': {'songId': ''}, 'returns': 'station state'}), protect, isAdmin, asyncHandler(admin.enqueue));
router.delete('/admin/:id/queue/:entryId', doc('Remove a song from the queue', {'returns': 'station state'}), protect, isAdmin, asyncHandler(admin.dequeue));
router.post('/admin/:id/skip', doc('Skip the current song', {'returns': 'station state'}), protect, isAdmin, asyncHandler(admin.skip));

// Mounted automatically at /api/rooms (hugo-server discoverModules); title/description feed the generated API docs.
router.meta = {
  title: 'Listening rooms',
  description: '24/7 stations and blind-listening rooms. Served by the realtime tier.',
  tier: 'realtime',
  guide: `Shared listening: 24/7 stations everyone hears in sync, and blind-listening rooms that compare two qualities of the same song.

REST covers lists and administration; listening itself happens over the realtime connection (see **Realtime events**): \`station:join\` returns the current state, the server pushes \`station:state\` on every change, and clients align playback to the server clock (\`clock:ping\`).

Administrators create stations from selection rules (genre groups, categories, calm or instrumental, popularity), preview which songs match, pin songs, queue the next song or skip the current one — changes reach listeners immediately.

This group is served by the realtime tier that holds room state; the load balancer routes \`/api/rooms\` there.`,
};

module.exports = router;
