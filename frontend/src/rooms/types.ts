// Kiểu dữ liệu phòng nghe chung dùng chung giữa danh sách, màn phòng và màn quản lý
// (khớp backend/models/ListeningRoom.js, rooms/stations.js, rooms/blindTest.js).
export type RoomRules = {
  groups?: string[]; excludeGroups?: string[]; categories?: string[];
  instrumental?: boolean; calm?: boolean; popular?: boolean;
};

export type StationInfo = {
  id: string; name: string; tagline?: string; colors: [string, string]; allowRequests: boolean; rules: RoomRules;
  listenerCount: number; now: { title: string; artist: string; coverArt?: string } | null;
};

export type BlindRoomInfo = {
  id: string; name: string; tagline?: string; colors: [string, string]; trialNo: number; listenerCount: number;
};

export type AdminRoom = {
  id: string; kind: 'station' | 'blind'; slug?: string; name: string; tagline?: string; colors: [string, string];
  order: number; active: boolean; allowRequests?: boolean; rules: RoomRules; pinned?: string[];
};
