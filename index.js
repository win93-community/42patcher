// welcome to import hell, we hope you enjoy your stay
import { checksum } from "/42/lib/algo/checksum.js";
import { dialog, confirm } from "/42/ui/layout/dialog.js";
import { toast } from "/42/ui/layout/toast.js";
import { JSON5 } from "/42/formats/data/JSON5.js";
import { http } from "/42/api/http.js";
import { keep } from "/42/api/keep.js";
import { fs } from "/42/api/fs.js";

const { parse } = JSON5;

const BASE_URL = "https://win93.xyz";
const PATCHES_URL = "https://win93.xyz/patches.json5"; // change url when app is updated
const STORAGE_PATH = "~/config/42patcher.json5";
const STORAGE_PATCHES_PATH = "~/config/42patcher-patches.json5";

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
  const networkPatches = parse(text);
  if (!Array.isArray(networkPatches)) return;

  let saved = null;
  try {
    saved = await fs.readJSON5(STORAGE_PATCHES_PATH);
  } catch {}

  if (!saved || !Array.isArray(saved) || patchesDiffer(networkPatches, saved)) {
    const useNew = await confirm("%md New patches available. Use updated patchlist? **Note: you should disable all your patches before updating the patchlist. If you haven't disabled them, click cancel. If this is your first time using 42patcher, click OK.**", {
      label: "42patcher",
      picto: "settings",
    });
    if (useNew) {
      await fs.write(STORAGE_PATCHES_PATH, JSON5.stringify(networkPatches));
      patches = networkPatches;
    } else if (saved) {
      patches = saved;
    } else {
      // this is really hacky but i love it
      patches = [{
        id: "no_patches",
        description: "No patches available. **Reopen 42patcher and click OK to check for patchlist updates.**",
        files: [],
      }]
    }
  } else {
    patches = saved;
  }

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

function backupPath(patch, file) {
  const rel = file.path.replace(/^\/+/, "");
  return `~/config/42patcher/backups/${patch.id}/${rel}`;
}

async function enablePatch(patch) {
  for (const file of getPatchFiles(patch)) {
    if (file.path && file.patch) {
      const backup = backupPath(patch, file);
      try {
        // @TODO find 42-native way to autocreate directories
        if (!(await fs.isFile(backup))) {
          const original = await fs.readText(file.path);
          const dirs = backup.split("/");
          let dir = "";
          for (const seg of dirs.slice(0, -1)) {
            dir += "/" + seg;
            try {
              await fs.writeDir(dir);
            } catch {}
          }
          await fs.write(backup, original);
        }
      } catch {}
      const content = await fetchPatchContent(file.patch);
      await fs.write(file.path, content);
      await toast("Patch applied: " + file.path, { label: "42patcher" });
    }
  }
}

async function disablePatch(patch) {
  for (const file of getPatchFiles(patch)) {
    if (file.path) {
      const backup = backupPath(patch, file);
      try {
        const original = await fs.readText(backup);
        await fs.write(file.path, original);
        await fs.delete(backup); // cleanup
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

    // prevent fieldset from stretching to fill dialog height
    style: { flex: "0 0 auto" }, //@TODO find sys42 class for this
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
              `%md ${patch.description}`,
            ],
          },

          {
            tag: "checkbox", //wtf
            label: "Enable",
            value: Boolean(patchState[patch.id]),
            created(el) {
              el.parentElement?.classList.add("shrink"); // hacky workaround to apply class to checkbox wrapper
            },
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

function patchIds(list) {
  return [...list].map((p) => p.id).sort();
}

function patchesDiffer(a, b) {
  const arrA = Array.from(a || []); //system stores in weird proxy(array) format
  const arrB = Array.from(b || []);
  if (arrA.length !== arrB.length) return true;
  const idsA = patchIds(arrA);
  const idsB = patchIds(arrB);
  return idsA.some((id, i) => id !== idsB[i]);
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
    footer: "42patcher may break your system. Use at your own risk.",
  });

  //console.dir(win)

}
