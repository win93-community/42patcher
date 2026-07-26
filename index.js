import { checksum } from "/42/lib/algo/checksum.js";
import { dialog } from "/42/ui/layout/dialog.js";
import { toast } from "/42/ui/layout/toast.js";
import { JSON5 } from "/42/formats/data/JSON5.js";
import { http } from "/42/api/http.js";
import { keep } from "/42/api/keep.js";
import { fs } from "/42/api/fs.js";

const { parse } = JSON5;

const BASE_URL = "https://win93.xyz";
const PATCHES_URL = "https://win93.xyz/patches.json5";
const STORAGE_PATH = "~/config/42patcher.json5";

let patches = [];
let patchState = {};

function getPatchFiles(patch) {
  if (patch.files) return patch.files;

  // shorthand
  if (patch.path)
    return [{ path: patch.path, hash: patch.hash, patch: patch.patch }];
  return [];
}

function displayedPatchFiles(patch) {
  const files = getPatchFiles(patch);
  if (files.length === 0) return "";
  if (files.length === 1) return files[0].path;
  return files.length + " files";
}

async function loadPatches() {
  const res = await http.get(PATCHES_URL);
  const text = await res.text();
  patches = parse(text);
  if (!Array.isArray(patches)) patches = [];

  for (const patch of patches) {
    const files = getPatchFiles(patch);
    for (const file of files) {
      if (file.path && !file.hash) {
        try {
          const content = await fs.readText(file.path);
          file.hash = await checksum(content, { output: "hex" });
        } catch {}
      }
    }
  }
}

async function fetchPatchContent(patchPath) {
  const res = await http.get(BASE_URL + patchPath);
  return res.text();
}

async function enablePatch(patch) {
  for (const file of getPatchFiles(patch)) {
    if (file.path && file.patch) {
      await toast("Applying patch: " + file.path, { label: "42patcher" });
      const content = await fetchPatchContent(file.patch);
      await fs.write(file.path, content);
      await toast("Patch applied: " + file.path, { label: "42patcher" });
    }
  }
}

async function disablePatch(patch) {
  for (const file of getPatchFiles(patch)) {
    if (file.path) {
      try {
        await toast("Restoring original file: " + file.path, { label: "42patcher" });
        const res = await http.get(file.path, {
          fresh: true,
          ignoreFileSystem: true,
        });
        const original = await res.text();
        await fs.write(file.path, original);
        await toast("Original file restored: " + file.path, { label: "42patcher" });
      } catch {
        await toast("Failed to restore original file: " + file.path, {
          label: "42patcher",
        });
      }
    }
  }
}

function buildContent() {
  return patches.map((patch) => ({
    tag: "fieldset",
    style: { scrollbarWidth: "none" }, //@TODO find sys42 class for this
    label: patch.id,
    content: [
      {
        tag: ".cols.gap-xs",
        content: [
          {
            tag: ".rows.gap-xs",
            content: [
              displayedPatchFiles(patch),
              {
                tag: "br",
              },
              patch.description,
            ],
          },

          {
            tag: "checkbox", //cant add .shrink
            label: "Enable",
            value: Boolean(patchState[patch.id]),
            action(e, el) {
              patchState[patch.id] = el.checked;
              if (el.checked) enablePatch(patch);
              else disablePatch(patch);
            },
          },
        ],
      },
    ],
  }));
}

export async function launchApp(app) {
  try {
    patchState = await keep(STORAGE_PATH, {}, {});
  } catch {
    patchState = {};
  }

  try {
    await loadPatches();
  } catch (e) {
    toast(new Error("Failed to load patches"), { label: "42patcher" });
    patches = [];
  }

  const win = await dialog({
    label: "42patcher",
    picto: "settings",
    width: 420,
    height: 400,
    minHeight: 400,
    content: buildContent(),
  });

  //console.dir(win)

  // @TODO fix this hacky work around - form shortcuts dont support classes
/*
  win.addEventListener("ui.render", () => {
    for (const checkbox of document.querySelectorAll("fieldset > div > div.control-box.control-box--checkbox")) {
      console.log("checkbox", checkbox);
      checkbox.classList.add("shrink");
    }
  });*/
}
