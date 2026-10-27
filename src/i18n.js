/**
 * English and Turkish UI strings plus a tiny lookup helper. Pure data, no DOM:
 * the UI applies the strings (see panel.js) and the tests check that both
 * languages define the same keys and placeholders.
 */

/** Supported languages; the first one is the default. */
export const LANGUAGES = Object.freeze(['en', 'tr']);

const EN = {
  'app.title': 'Pathfinding Visualizer',
  'header.clearBoard': 'Clear board',
  'header.language': 'TR – switch to Turkish',
  'board.label':
    'Grid editor. Drag to draw walls. Arrow keys move a cursor, Enter paints, S and E move the start and end.',
  'board.brush': 'Brush',
  'board.wall': 'Wall',
  'board.weight': 'Weight',
  'board.hint': 'Drag to draw · Shift + drag for weights · right-click erases',
  'board.touchHint': 'Drag to draw · drag the green or red node to move it',
  'legend.label': 'Legend',
  'legend.start': 'Start',
  'legend.end': 'End',
  'legend.empty': 'Empty',
  'legend.wall': 'Wall',
  'legend.weight': 'Weight (cost 5)',
  'legend.frontier': 'Frontier',
  'legend.visited': 'Visited',
  'legend.path': 'Path',
  'controls.label': 'Settings',
  'controls.algorithm': 'Algorithm',
  'controls.maze': 'Maze',
  'controls.generate': 'Generate',
  'controls.speed': 'Speed',
  'speed.slow': 'Slow',
  'speed.normal': 'Normal',
  'speed.fast': 'Fast',
  'algo.astar': 'A* search',
  'algo.dijkstra': 'Dijkstra’s algorithm',
  'algo.bfs': 'Breadth-first search',
  'algo.greedy': 'Greedy best-first search',
  'algo.dfs': 'Depth-first search',
  'short.astar': 'A*',
  'short.dijkstra': 'Dijkstra',
  'short.bfs': 'BFS',
  'short.greedy': 'Greedy search',
  'short.dfs': 'DFS',
  'maze.recursiveDivision': 'Recursive division',
  'maze.randomizedDfs': 'Randomized DFS',
  'actions.visualize': 'Visualize',
  'actions.skip': 'Skip to end',
  'actions.clearPath': 'Clear path',
  'stats.label': 'Run statistics',
  'stats.visited': 'Visited',
  'stats.length': 'Length',
  'stats.cost': 'Cost',
  'stats.time': 'Time',
  'stats.none': '–',
  'stats.ms': '{value} ms',
  'status.ready': 'Draw walls, drag the start or end, or generate a maze. Then press Visualize.',
  'status.building': 'Building the maze…',
  'status.running': '{algo} is exploring…',
  'status.found': '{algo} found a path: {length} steps, cost {cost}.',
  'status.unreachable': 'No path: the end is walled off. {algo} explored every cell it could reach.',
  'note.always': 'It is guaranteed to be the cheapest.',
  'note.ignoresWeights': 'BFS ignores weights, so a cheaper path may exist.',
  'note.shortestUnweighted': 'Without weights, BFS guarantees the shortest path.',
  'note.never': '{algo} does not guarantee the shortest path.',
  'guarantees.title': 'Shortest-path guarantees',
  'guarantees.algorithm': 'Algorithm',
  'guarantees.weights': 'Uses weights',
  'guarantees.shortest': 'Shortest path',
  'guarantees.yes': 'Yes',
  'guarantees.no': 'No',
  'guarantees.always': 'Always',
  'guarantees.unweighted': 'Unweighted only',
  'guarantees.never': 'Not guaranteed',
  'guide.title': 'How to use',
  'guide.draw': 'Click or drag on the grid to draw walls. A stroke that starts on a wall erases instead.',
  'guide.weights':
    'Hold Shift or pick the Weight brush to place weights: entering a weighted cell costs 5, every other step costs 1. Right-click erases.',
  'guide.move': 'Drag the green start or the red end to move it. After a run, the path follows your edits instantly.',
  'guide.touch': 'On a touch screen, draw with one finger and use the brush switch for weights.',
  'keys.title': 'Keyboard',
  'keys.spaceKey': 'Space',
  'keys.space': 'Visualize, or skip to the end',
  'keys.c': 'Clear the path',
  'keys.shiftC': 'Clear the board',
  'keys.m': 'Generate a maze',
  'keys.w': 'Switch between wall and weight',
  'keys.digits': 'Choose an algorithm',
  'keys.arrowsKey': 'Arrows + Enter',
  'keys.arrows': 'Move the grid cursor and paint (focus the grid first)',
  'keys.se': 'Move the start or the end to the cursor',
  'about.title': 'About the algorithms',
  'about.astar':
    'Dijkstra plus a Manhattan-distance estimate of the way left, so it heads for the end and explores far fewer cells.',
  'about.dijkstra': 'Expands cells in order of their cost from the start. The classic cheapest-path algorithm.',
  'about.bfs': 'Spreads out in rings of equal step count. Fewest steps, but blind to weights.',
  'about.greedy': 'Always jumps to the cell that looks closest to the end. Fast, but walls fool it easily.',
  'about.dfs': 'Follows one corridor as deep as it goes before backtracking. Finds a path, rarely a short one.',
  'footer.license': 'MIT',
  'footer.source': 'Source on GitHub',
};

const TR = {
  'app.title': 'Yol Bulma Görselleştiricisi',
  'header.clearBoard': 'Tahtayı temizle',
  'header.language': 'EN – İngilizceye geç',
  'board.label':
    'Izgara düzenleyici. Duvar çizmek için sürükle. Ok tuşları imleci taşır, Enter boyar, S ve E başlangıcı ve hedefi taşır.',
  'board.brush': 'Fırça',
  'board.wall': 'Duvar',
  'board.weight': 'Ağırlık',
  'board.hint': 'Çizmek için sürükle · ağırlık için Shift + sürükle · sağ tık siler',
  'board.touchHint': 'Çizmek için sürükle · taşımak için yeşil ya da kırmızı düğümü sürükle',
  'legend.label': 'Gösterge',
  'legend.start': 'Başlangıç',
  'legend.end': 'Hedef',
  'legend.empty': 'Boş',
  'legend.wall': 'Duvar',
  'legend.weight': 'Ağırlık (maliyet 5)',
  'legend.frontier': 'Sınır',
  'legend.visited': 'Gezilen',
  'legend.path': 'Yol',
  'controls.label': 'Ayarlar',
  'controls.algorithm': 'Algoritma',
  'controls.maze': 'Labirent',
  'controls.generate': 'Oluştur',
  'controls.speed': 'Hız',
  'speed.slow': 'Yavaş',
  'speed.normal': 'Normal',
  'speed.fast': 'Hızlı',
  'algo.astar': 'A* araması',
  'algo.dijkstra': 'Dijkstra algoritması',
  'algo.bfs': 'Genişlik öncelikli arama',
  'algo.greedy': 'Açgözlü en iyi öncelikli arama',
  'algo.dfs': 'Derinlik öncelikli arama',
  'short.astar': 'A*',
  'short.dijkstra': 'Dijkstra',
  'short.bfs': 'BFS',
  'short.greedy': 'Açgözlü arama',
  'short.dfs': 'DFS',
  'maze.recursiveDivision': 'Özyinelemeli bölme',
  'maze.randomizedDfs': 'Rastgele DFS',
  'actions.visualize': 'Görselleştir',
  'actions.skip': 'Sona atla',
  'actions.clearPath': 'Yolu temizle',
  'stats.label': 'Arama istatistikleri',
  'stats.visited': 'Gezilen',
  'stats.length': 'Uzunluk',
  'stats.cost': 'Maliyet',
  'stats.time': 'Süre',
  'stats.none': '–',
  'stats.ms': '{value} ms',
  'status.ready': 'Duvar çiz, başlangıcı ya da hedefi sürükle veya labirent oluştur. Sonra Görselleştir’e bas.',
  'status.building': 'Labirent oluşturuluyor…',
  'status.running': '{algo} keşfediyor…',
  'status.found': '{algo} bir yol buldu: {length} adım, maliyet {cost}.',
  'status.unreachable': 'Yol yok: hedefin çevresi kapalı. {algo} ulaşabildiği her hücreyi gezdi.',
  'note.always': 'Bunun en ucuz yol olduğu garantidir.',
  'note.ignoresWeights': 'BFS ağırlıkları yok sayar; daha ucuz bir yol olabilir.',
  'note.shortestUnweighted': 'Ağırlık yokken BFS en kısa yolu garanti eder.',
  'note.never': '{algo} en kısa yolu garanti etmez.',
  'guarantees.title': 'En kısa yol garantisi',
  'guarantees.algorithm': 'Algoritma',
  'guarantees.weights': 'Ağırlık',
  'guarantees.shortest': 'En kısa yol',
  'guarantees.yes': 'Evet',
  'guarantees.no': 'Hayır',
  'guarantees.always': 'Her zaman',
  'guarantees.unweighted': 'Yalnız ağırlıksız',
  'guarantees.never': 'Garanti yok',
  'guide.title': 'Nasıl kullanılır',
  'guide.draw': 'Duvar çizmek için ızgaraya tıkla ya da sürükle. Duvarın üstünden başlayan çizgi siler.',
  'guide.weights':
    'Ağırlık koymak için Shift’e basılı tut ya da Ağırlık fırçasını seç: ağırlıklı hücreye girmek 5, diğer her adım 1 maliyetlidir. Sağ tık siler.',
  'guide.move':
    'Taşımak için yeşil başlangıcı ya da kırmızı hedefi sürükle. Arama bittikten sonra yol, değişikliklerini anında izler.',
  'guide.touch': 'Dokunmatik ekranda tek parmakla çiz; ağırlık için fırça düğmesini kullan.',
  'keys.title': 'Klavye',
  'keys.spaceKey': 'Boşluk',
  'keys.space': 'Görselleştir ya da sona atla',
  'keys.c': 'Yolu temizle',
  'keys.shiftC': 'Tahtayı temizle',
  'keys.m': 'Labirent oluştur',
  'keys.w': 'Duvar ile ağırlık arasında geç',
  'keys.digits': 'Algoritma seç',
  'keys.arrowsKey': 'Oklar + Enter',
  'keys.arrows': 'Izgara imlecini taşı ve boya (önce ızgaraya odaklan)',
  'keys.se': 'Başlangıcı ya da hedefi imlece taşı',
  'about.title': 'Algoritmalar hakkında',
  'about.astar':
    'Dijkstra’ya kalan yolun Manhattan uzaklığıyla tahminini ekler; hedefe yönelir ve çok daha az hücre gezer.',
  'about.dijkstra': 'Hücreleri başlangıçtan maliyet sırasıyla açar. Klasik en ucuz yol algoritması.',
  'about.bfs': 'Eşit adım sayılı halkalar hâlinde yayılır. En az adımı bulur ama ağırlıkları görmez.',
  'about.greedy': 'Her zaman hedefe en yakın görünen hücreye atlar. Hızlıdır ama duvarlar onu kolayca yanıltır.',
  'about.dfs': 'Geri dönmeden önce bir koridoru sonuna kadar izler. Yol bulur ama nadiren kısa olanı.',
  'footer.license': 'MIT',
  'footer.source': 'Kaynak kod GitHub’da',
};

/** Every string by language. Both languages define exactly the same keys. */
export const STRINGS = Object.freeze({ en: Object.freeze(EN), tr: Object.freeze(TR) });

/**
 * Tells whether a value is a supported language code.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isLanguage(value) {
  return LANGUAGES.includes(/** @type {string} */ (value));
}

/**
 * The language the header toggle switches to.
 * @param {string} lang
 * @returns {string}
 */
export function otherLanguage(lang) {
  return lang === 'tr' ? 'en' : 'tr';
}

/**
 * Looks up a string and fills its {placeholders}.
 * @param {string} lang
 * @param {string} key
 * @param {Record<string, string | number>} [params]
 * @returns {string} The translation, the English text when the language is unknown,
 *   or the key itself when no language defines it.
 */
export function translate(lang, key, params) {
  const table = isLanguage(lang) ? STRINGS[lang] : STRINGS.en;
  const template = Object.hasOwn(table, key) ? table[key] : key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) => (Object.hasOwn(params, name) ? String(params[name]) : match));
}
