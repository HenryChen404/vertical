import { writeFileSync } from "fs";
import { setSeed, box, arrow, textEl, rect, diamondBox, colors, excalidraw, toSvg, toPng } from "excalidrawer";

setSeed(200000);

// Layout constants
const BW = 140, BH = 56, GAP = 60, ROW_GAP = 80;
const Y_MAIN = 180;  // main flow Y
const Y_TOP = Y_MAIN - BH - ROW_GAP;   // parallel top row
const Y_BOT = Y_MAIN + BH + ROW_GAP;   // parallel bottom row / loop path

// X positions for each column
let x = 40;
const X_SELECT = x; x += BW + GAP;
const X_CREATE = x; x += BW + GAP;
const X_PLAUD = x;
const X_DOTS = x;
const X_WHISPER = x; x += BW + GAP;
const X_ALLDONE = x; x += BW + GAP;
// Extraction fan-out: main node, then 3 parallel skill boxes, then fan-in
const X_EXTRACT = x; x += BW + GAP;
const X_SKILLS = x; x += BW + GAP;  // Account / ··· / Event Summary column
const X_REVIEW = x; x += BW + GAP;
const X_CONFIRMED = x; x += BW + GAP;
const X_PUSH = x; x += BW + GAP;
const X_DONE = x;

// Helper: center Y for a box
const cy = (y) => y + BH / 2;

const bg = [];
const conn = [];
const fg = [];

// Title - centered above both phases
const totalWidth = X_DONE + BW - X_SELECT;
fg.push(textEl("title", X_SELECT + totalWidth / 2 - 200, Y_TOP - 54, 400, 32, "CRM Update Workflow", 24, { textAlign: "center" }));

// Phase A background
bg.push(rect("phA", X_SELECT - 10, Y_TOP - 20, X_ALLDONE + BW - X_SELECT + 20, Y_BOT + BH - Y_TOP + 40, "#f8f9fa"));
fg.push(textEl("phAl", X_SELECT, Y_TOP - 16, 200, 16, "Phase A: Transcription (DB + asyncio)", 11));

// Phase B background
bg.push(rect("phB", X_EXTRACT - 10, Y_TOP - 20, X_DONE + BW - X_EXTRACT + 20, Y_BOT + BH - Y_TOP + 40, "#f3f0ff"));
fg.push(textEl("phBl", X_EXTRACT, Y_TOP - 16, 300, 16, "Phase B: LangGraph (extraction + review + push)", 11));

// === Phase A Nodes ===

fg.push(...box("select", "selectT", X_SELECT, Y_MAIN, BW, BH, colors.yellow, "User Selects\nRecordings", 13));
fg.push(...box("create", "createT", X_CREATE, Y_MAIN, BW, BH, colors.blue, "Create Workflow\n+ Tasks", 13));

// Parallel transcription: PLAUD (top), ··· (middle), Whisper (bottom)
fg.push(...box("plaud", "plaudT", X_PLAUD, Y_TOP, BW, BH, colors.orange, "PLAUD\nTranscribe", 13));
fg.push(...box("dots1", "dots1T", X_DOTS, Y_MAIN, BW, BH, colors.gray, "···", 18));
fg.push(...box("whisper", "whisperT", X_WHISPER, Y_BOT, BW, BH, colors.orange, "Whisper\nTranscribe", 13));

fg.push(...diamondBox("alldone", "alldoneT", X_ALLDONE, Y_MAIN - 10, BW, BH + 20, colors.orange, "All Done?", 13));

// === Phase B Nodes ===

// Extract entry node
fg.push(...box("extract", "extractT", X_EXTRACT, Y_MAIN, BW, BH, colors.purple, "Extract", 14));

// Parallel skills: Account (top), Opportunity (middle-top), ··· (middle), Event Summary (bottom)
const SKILL_BH = 44;
const SKILL_GAP = 12;
const totalSkillsHeight = SKILL_BH * 4 + SKILL_GAP * 3;
const Y_SKILL_START = Y_MAIN + BH / 2 - totalSkillsHeight / 2;

const Y_ACCOUNT = Y_SKILL_START;
const Y_OPP = Y_ACCOUNT + SKILL_BH + SKILL_GAP;
const Y_SKILL_DOTS = Y_OPP + SKILL_BH + SKILL_GAP;
const Y_SUMMARY = Y_SKILL_DOTS + SKILL_BH + SKILL_GAP;

fg.push(...box("skAcc", "skAccT", X_SKILLS, Y_ACCOUNT, BW, SKILL_BH, colors.purple, "Account", 12));
fg.push(...box("skOpp", "skOppT", X_SKILLS, Y_OPP, BW, SKILL_BH, colors.purple, "Opportunity", 12));
fg.push(...box("skDots", "skDotsT", X_SKILLS, Y_SKILL_DOTS, BW, SKILL_BH, colors.gray, "···", 16));
fg.push(...box("skSum", "skSumT", X_SKILLS, Y_SUMMARY, BW, SKILL_BH, colors.purple, "Event Summary", 12));

// Review
fg.push(...box("review", "reviewT", X_REVIEW, Y_MAIN, BW, BH, colors.green, "Human Review\n(chat)", 13));

// Confirmed?
fg.push(...diamondBox("confirmed", "confirmedT", X_CONFIRMED, Y_MAIN - 10, BW, BH + 20, colors.green, "Confirmed?", 13));

// Push
fg.push(...box("push", "pushT", X_PUSH, Y_MAIN, BW, BH, "#ffc9c9", "Push to\nSalesforce", 13));

// Done
fg.push(...box("done", "doneT", X_DONE, Y_MAIN, BW, BH, colors.green, "Done", 14));

// Re-extract (loop, below main)
fg.push(...box("reextract", "reextractT", X_REVIEW, Y_BOT, BW, BH, colors.purple, "Re-extract\nDimension", 13));

// === Phase A Arrows ===

// Select → Create
conn.push(arrow("a1", X_SELECT + BW, cy(Y_MAIN), [[0, 0], [GAP, 0]]));

// Create → PLAUD (up)
conn.push(arrow("a2a", X_CREATE + BW, cy(Y_MAIN), [[0, 0], [GAP / 2, 0], [GAP / 2, -(Y_MAIN - Y_TOP)], [GAP, -(Y_MAIN - Y_TOP)]]));
// Create → dots (right)
conn.push(arrow("a2b", X_CREATE + BW, cy(Y_MAIN), [[0, 0], [GAP, 0]]));
// Create → Whisper (down)
conn.push(arrow("a2c", X_CREATE + BW, cy(Y_MAIN), [[0, 0], [GAP / 2, 0], [GAP / 2, Y_BOT - Y_MAIN], [GAP, Y_BOT - Y_MAIN]]));

// PLAUD → All Done
conn.push(arrow("a3a", X_PLAUD + BW, cy(Y_TOP), [[0, 0], [GAP / 2, 0], [GAP / 2, Y_MAIN - Y_TOP], [GAP, Y_MAIN - Y_TOP]]));
// dots → All Done
conn.push(arrow("a3b", X_DOTS + BW, cy(Y_MAIN), [[0, 0], [GAP, 0]]));
// Whisper → All Done
conn.push(arrow("a3c", X_WHISPER + BW, cy(Y_BOT), [[0, 0], [GAP / 2, 0], [GAP / 2, -(Y_BOT - Y_MAIN)], [GAP, -(Y_BOT - Y_MAIN)]]));

// All Done → Extract (Yes)
conn.push(arrow("a4", X_ALLDONE + BW, cy(Y_MAIN), [[0, 0], [GAP, 0]]));
fg.push(textEl("a4l", X_ALLDONE + BW + 10, cy(Y_MAIN) - 18, 30, 14, "Yes", 11));

// === Extraction fan-out / fan-in ===

const skCy = (y) => y + SKILL_BH / 2;

// Extract → each skill
conn.push(arrow("aE1", X_EXTRACT + BW, cy(Y_MAIN), [[0, 0], [GAP / 2, 0], [GAP / 2, skCy(Y_ACCOUNT) - cy(Y_MAIN)], [GAP, skCy(Y_ACCOUNT) - cy(Y_MAIN)]]));
conn.push(arrow("aE2", X_EXTRACT + BW, cy(Y_MAIN), [[0, 0], [GAP / 2, 0], [GAP / 2, skCy(Y_OPP) - cy(Y_MAIN)], [GAP, skCy(Y_OPP) - cy(Y_MAIN)]]));
conn.push(arrow("aE3", X_EXTRACT + BW, cy(Y_MAIN), [[0, 0], [GAP / 2, 0], [GAP / 2, skCy(Y_SKILL_DOTS) - cy(Y_MAIN)], [GAP, skCy(Y_SKILL_DOTS) - cy(Y_MAIN)]]));
conn.push(arrow("aE4", X_EXTRACT + BW, cy(Y_MAIN), [[0, 0], [GAP / 2, 0], [GAP / 2, skCy(Y_SUMMARY) - cy(Y_MAIN)], [GAP, skCy(Y_SUMMARY) - cy(Y_MAIN)]]));

// Each skill → Review (fan-in)
conn.push(arrow("aF1", X_SKILLS + BW, skCy(Y_ACCOUNT), [[0, 0], [GAP / 2, 0], [GAP / 2, cy(Y_MAIN) - skCy(Y_ACCOUNT)], [GAP, cy(Y_MAIN) - skCy(Y_ACCOUNT)]]));
conn.push(arrow("aF2", X_SKILLS + BW, skCy(Y_OPP), [[0, 0], [GAP / 2, 0], [GAP / 2, cy(Y_MAIN) - skCy(Y_OPP)], [GAP, cy(Y_MAIN) - skCy(Y_OPP)]]));
conn.push(arrow("aF3", X_SKILLS + BW, skCy(Y_SKILL_DOTS), [[0, 0], [GAP / 2, 0], [GAP / 2, cy(Y_MAIN) - skCy(Y_SKILL_DOTS)], [GAP, cy(Y_MAIN) - skCy(Y_SKILL_DOTS)]]));
conn.push(arrow("aF4", X_SKILLS + BW, skCy(Y_SUMMARY), [[0, 0], [GAP / 2, 0], [GAP / 2, cy(Y_MAIN) - skCy(Y_SUMMARY)], [GAP, cy(Y_MAIN) - skCy(Y_SUMMARY)]]));

// === Review → Confirmed → Push → Done ===

conn.push(arrow("a6", X_REVIEW + BW, cy(Y_MAIN), [[0, 0], [GAP, 0]]));
conn.push(arrow("a7", X_CONFIRMED + BW, cy(Y_MAIN), [[0, 0], [GAP, 0]]));
fg.push(textEl("a7l", X_CONFIRMED + BW + 10, cy(Y_MAIN) - 18, 30, 14, "Yes", 11));
conn.push(arrow("a8", X_PUSH + BW, cy(Y_MAIN), [[0, 0], [GAP, 0]]));

// === Loop: Confirmed → No → Re-extract → Review ===

// Confirmed → down → Re-extract
conn.push(arrow("aLoop1", X_CONFIRMED + BW / 2, cy(Y_MAIN) + BH / 2 + 10, [
  [0, 0],
  [0, Y_BOT + BH / 2 - cy(Y_MAIN) - BH / 2 - 10],
  [-(X_CONFIRMED + BW / 2 - X_REVIEW - BW), Y_BOT + BH / 2 - cy(Y_MAIN) - BH / 2 - 10],
]));
fg.push(textEl("aLoopL", X_CONFIRMED + BW / 2 + 6, cy(Y_MAIN) + BH / 2 + 12, 24, 14, "No", 11));

// Re-extract → back up to Review
conn.push(arrow("aLoop2", X_REVIEW + BW / 2, Y_BOT, [
  [0, 0],
  [0, -(Y_BOT - Y_MAIN - BH)],
]));

// Combine layers
const elements = [...bg, ...conn, ...fg];

writeFileSync("diagrams/crm-workflow.excalidraw", excalidraw(elements));
writeFileSync("diagrams/crm-workflow.svg", toSvg(elements));
writeFileSync("diagrams/crm-workflow.png", await toPng(elements, 2));

console.log("Done!");
