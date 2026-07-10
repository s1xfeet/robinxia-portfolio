// Work wall data. Each item renders as a tile.
// kind: "wide" (16:9) or "tall" (9:16, vertical Shorts).
// src/poster: the muted looping clip + still frame shown in the tile (see wall.js).
//   These are short silent segments pulled from the real videos, self-hosted in
//   assets/wall/. To refresh, re-run the clip pipeline and keep the same names.
// href: where the tile points. A YouTube video URL opens in the lightbox
//   (js/lightbox.js). A "#section" scrolls in-page. Anything else opens in a tab.
export const WALL_ROWS = [
  {
    speed: 80,
    items: [
      { client: "jackdoesskits", label: "Sketch Comedy", kind: "wide", href: "https://youtu.be/CgJolSvDO5g", src: "assets/wall/jack1.mp4", poster: "assets/wall/jack1.jpg" },
      { client: "jackdoesskits", label: "Sketch Comedy", kind: "wide", href: "https://youtu.be/W9j0dezbjOw", src: "assets/wall/jack2.mp4", poster: "assets/wall/jack2.jpg" },
      { client: "jackdoesskits", label: "Sketch Comedy", kind: "wide", href: "https://youtu.be/ehmWKL0nH5g", src: "assets/wall/jack3.mp4", poster: "assets/wall/jack3.jpg" },
      { client: "jackdoesskits", label: "Sketch Comedy", kind: "wide", href: "https://youtu.be/a59gdEbij3o", src: "assets/wall/jack4.mp4", poster: "assets/wall/jack4.jpg" },
      { client: "jackdoesskits", label: "Sketch Comedy", kind: "wide", href: "https://youtu.be/USWDz5vG7lg", src: "assets/wall/jack5.mp4", poster: "assets/wall/jack5.jpg" },
      { client: "jackdoesskits", label: "Sketch Comedy", kind: "wide", href: "https://youtu.be/-a7hFbNbuDE", src: "assets/wall/jack6.mp4", poster: "assets/wall/jack6.jpg" },
      { client: "jackdoesskits", label: "Sketch Comedy", kind: "wide", href: "https://youtu.be/PgWWIpsRKkg", src: "assets/wall/jack7.mp4", poster: "assets/wall/jack7.jpg" },
      { client: "jackdoesskits", label: "Sketch Comedy", kind: "wide", href: "https://youtu.be/wvVJzNjqlsY", src: "assets/wall/jack8.mp4", poster: "assets/wall/jack8.jpg" },
    ],
  },
  {
    speed: 95,
    items: [
      { client: "NK", label: "Street Interviews", kind: "tall", href: "https://www.youtube.com/shorts/jDOf92K3HIo", src: "assets/wall/nk1.mp4", poster: "assets/wall/nk1.jpg" },
      { client: "100T Derrek", label: "Gaming Highlights", kind: "tall", href: "https://www.youtube.com/shorts/dhW3FK4ev1U", src: "assets/wall/derrek1.mp4", poster: "assets/wall/derrek1.jpg" },
      { client: "NK", label: "Street Interviews", kind: "tall", href: "https://www.youtube.com/shorts/e-yDemEIubk", src: "assets/wall/nk2.mp4", poster: "assets/wall/nk2.jpg" },
      { client: "100T Derrek", label: "Gaming Highlights", kind: "tall", href: "https://www.youtube.com/shorts/YmbGp5RKQXo", src: "assets/wall/derrek2.mp4", poster: "assets/wall/derrek2.jpg" },
      { client: "NK", label: "Street Interviews", kind: "tall", href: "https://www.youtube.com/shorts/51Nbs1EbDqg", src: "assets/wall/nk3.mp4", poster: "assets/wall/nk3.jpg" },
      { client: "100T Derrek", label: "Gaming Highlights", kind: "tall", href: "https://www.youtube.com/shorts/0l3RMSXLIJg", src: "assets/wall/derrek3.mp4", poster: "assets/wall/derrek3.jpg" },
      { client: "NK", label: "Street Interviews", kind: "tall", href: "https://www.youtube.com/shorts/PLg02fg-Ye4", src: "assets/wall/nk4.mp4", poster: "assets/wall/nk4.jpg" },
      { client: "100T Derrek", label: "Gaming Highlights", kind: "tall", href: "https://www.youtube.com/shorts/hsHD0cj7gTk", src: "assets/wall/derrek4.mp4", poster: "assets/wall/derrek4.jpg" },
    ],
  },
  {
    speed: 70,
    items: [
      { client: "Zack Shutt", label: "Shortform scripts & editing", kind: "wide", href: "https://youtu.be/OLn2KItqA4A", src: "assets/wall/zacklong.mp4", poster: "assets/wall/zacklong.jpg" },
      { client: "Tim", label: "Long form Explainers", kind: "wide", href: "https://youtu.be/yFxEGkT_pfw", src: "assets/wall/tim1.mp4", poster: "assets/wall/tim1.jpg" },
      { client: "Zack Shutt", label: "Shortform scripts & editing", kind: "tall", href: "https://www.youtube.com/shorts/QnKB1fic6_c", src: "assets/wall/zackloud.mp4", poster: "assets/wall/zackloud.jpg" },
      { client: "Colby", label: "Street Interviews", kind: "tall", href: "https://www.youtube.com/shorts/TbaPqq0dA7g", src: "assets/wall/colby1.mp4", poster: "assets/wall/colby1.jpg" },
      { client: "Zack Shutt", label: "Shortform scripts & editing", kind: "tall", href: "https://www.youtube.com/shorts/LwMm_cd6ojk", src: "assets/wall/zack32.mp4", poster: "assets/wall/zack32.jpg" },
      { client: "Tim", label: "Long form Explainers", kind: "wide", href: "https://youtu.be/Y4YcJX-6m6E", src: "assets/wall/tim2.mp4", poster: "assets/wall/tim2.jpg" },
      { client: "Colby", label: "Street Interviews", kind: "tall", href: "https://www.tiktok.com/@colbymartel/video/7493629484642405663", src: "assets/wall/colby2.mp4", poster: "assets/wall/colby2.jpg" },
      { client: "Zack Shutt", label: "Shortform scripts & editing", kind: "tall", href: "https://www.youtube.com/shorts/BKCSxsrmf9E", src: "assets/wall/zackwin10.mp4", poster: "assets/wall/zackwin10.jpg" },
      { client: "The Writing", label: "Video scripts", kind: "tall", href: "#writing", src: "assets/wall/zack32.mp4", poster: "assets/wall/zack32.jpg" },
      { client: "Related Shorts Changer", label: "Chrome extension", kind: "tall", href: "#builds", src: "assets/wall/colby1.mp4", poster: "assets/wall/colby1.jpg" },
    ],
  },
];
