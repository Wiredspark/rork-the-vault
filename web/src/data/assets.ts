export const IMAGES = {
  vaultDoor: "https://2dm3swhv07nsf2bo6qgbd.rork.app/~assets/img/8ea95d10-dbff-46ba-b984-9849e6c321f8.png",
  vaultOpen: "https://2dm3swhv07nsf2bo6qgbd.rork.app/~assets/img/7b960a0d-ec29-4107-bb70-b11ef022225b.png",
} as const;

export const SOUNDS = {
  unlock: "https://2dm3swhv07nsf2bo6qgbd.rork.app/~assets/aud/3d82863e-b4ce-42c1-b304-fb3dc4dc7ff6.mp3",
  click: "https://2dm3swhv07nsf2bo6qgbd.rork.app/~assets/aud/772b053c-e804-4505-bd87-17a49c4e2d5f.mp3",
  correct: "https://2dm3swhv07nsf2bo6qgbd.rork.app/~assets/aud/9205d54c-0af2-45d1-b046-e059dbc7ea78.mp3",
  wrong: "https://2dm3swhv07nsf2bo6qgbd.rork.app/~assets/aud/c26d4eff-40b7-40e5-bab6-1c1dbbf2634d.mp3",
} as const;

export type SoundName = keyof typeof SOUNDS;
