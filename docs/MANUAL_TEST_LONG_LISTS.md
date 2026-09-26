# Manual test: a list over several columns

How to try `derived_from#2`-style columns (README, "Long lists") against the dev portal, `https://lattice-api-dev.demo.lattice-data.org`, from a throwaway copy of the template sheet. Nothing here touches the released template.

## 1. A throwaway sheet running this branch

1. In Google Drive, open the current template sheet (link in README) and make a copy: **File → Make a copy**. Name it, e.g., `submitter test: long lists`.
2. In the copy: **Extensions → Apps Script → ⚙ Project Settings** and copy the **Script ID**.
3. In this checkout, on the branch to test, create `dev/test.clasp.json` (`dev/` is ignored by git). `rootDir` is relative to that file:

   ```json
   {"scriptId": "PASTE-THE-SCRIPT-ID", "rootDir": "../dist"}
   ```

4. Build and push:

   ```bash
   npm run build && npx clasp -P dev/test.clasp.json push -f
   ```

5. Reload the copy. In the `Lattice v…` menu: **Set endpoint** → `https://lattice-api-dev.demo.lattice-data.org`, then **Authorize for LATTICE** with a key/secret from the dev portal's Profile page. Authorize the script when Google asks, as described in the README.

## 2. A row with a long `derived_from`

1. Add a tab. Menu → **Set profile name** → `sequence_file`, then **🛠 Tools → Make a new template row**.
2. Make the cells:

   ```bash
   python3 scripts/long_list_cells.py --count 2500
   ```

   It reads 2,502 File uuids from dev and writes `dev/long-list-cells/derived_from.txt`, `derived_from#2.txt` and `derived_from#3.txt`, each under 40,000 characters, and prints two spare uuids for the append test.
3. Type the headers `derived_from#2` and `derived_from#3` into two empty header cells, anywhere in the header row.
4. Paste each file into the matching cell of the template row, e.g. `pbcopy < "dev/long-list-cells/derived_from#2.txt"` and ⌘V in the cell.
5. Fill the red (required) properties as for any new file: `lab`, `file_format`, and `aliases` such as `["lattice:long-list-test-1"]` so the row can be found again. **Validate** tells you what else the dev schema wants.

For a self-contained test on another profile, `--prop aliases --lab <your-lab> --count 1500` makes up unique aliases instead.

## 3. What to check

| Step | Do | Expect |
| --- | --- | --- |
| Validate | Menu → **Validate** | `#response` is `ValidationSuccess`. Then paste a uuid from `derived_from` into `derived_from#3` as well and Validate again: a `uniqueItems` error for `/derived_from`. Undo. |
| Highlight | **🛠 Tools → Highlight sheet with profile schema** | `derived_from#2` and `#3` are red, bold-italic and underlined like `derived_from`; hovering shows "Part 2 of derived_from". No "missing properties" alert. |
| POST | Menu → **POST new metadata to portal** | `POST,201`, and `uuid` is filled in. |
| GET | Clear the three `derived_from*` cells, then **GET metadata from portal** | The cells are refilled with bare uuids, in order, each under 40,000 characters. No new column appears. |
| Shrink | Put `["<one uuid>"]` in `derived_from`, blank `#2` and `#3`; select the `derived_from` column → **PATCH selected columns** | The dialog says `derived_from (3 columns)`; `PATCH,200`. Clear the cells and GET: only `derived_from` is filled, `#2` and `#3` stay blank. |
| Whole list from one part | Paste the three parts back; select **only** `derived_from#2` → **PATCH selected columns** | The dialog says the list is sent whole; `PATCH,200`. Clear and GET: all three columns are filled again. |
| Append | Clear the three cells; put `["<spare uuid>"]` in `derived_from`; select that column → **PATCH selected columns (append to lists)** | `APPEND,200`, `derived_from: added /sequence_files/<spare uuid>/`; the cells hold the full list again, 2,501 uuids over three columns. |
| Append again | Run the same append with the cells as they are | `APPEND,no change`, quickly: nothing is looked up. |
| Bad part | Type `x` into `derived_from#2` → **Validate**; then **PATCH selected columns** | `Could not validate this row: Error: derived_from#2 must be a JSON list…`. The PATCH alert says `1 row(s) were not sent…` and the row's `#response` starts with `PATCH,error`. Fix the cell. |
| Export | **🛠 Tools → Export selected row to JSON** | One `derived_from` list holding every uuid. |

The test file stays on dev with its `derived_from`, which is fine there.
