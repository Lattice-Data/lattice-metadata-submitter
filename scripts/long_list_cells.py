#!/usr/bin/env python3
"""Make the cells of a list too long for one Google Sheets cell.

The submitter lets a list property continue over columns named
derived_from, derived_from#2, derived_from#3, ... (README, "Long lists").
This script writes those cells for a test row: one JSON list per part, each
under the tool's 40,000-character cap, in files named like the columns:

    dev/long-list-cells/derived_from.txt
    dev/long-list-cells/derived_from#2.txt
    ...

Paste each file's content into the matching column of the row. On macOS:

    pbcopy < "dev/long-list-cells/derived_from#2.txt"

It also writes row.tsv (a header line and one data line) for File > Import.

Two kinds of list:
  --prop derived_from   uuids of files that exist on the portal, from its search
                        (works for any list of links; pick the type with --type)
  --prop aliases        made-up aliases, unique per run, for a self-contained test

Examples:
  python3 scripts/long_list_cells.py --count 2500
  python3 scripts/long_list_cells.py --prop aliases --lab lattice --count 1500

The portal is read anonymously. Set LATTICE_KEY and LATTICE_SECRET to read as
yourself, for a portal that hides objects from anonymous users.
"""
import argparse
import base64
import datetime
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_ENDPOINT = "https://lattice-api-dev.demo.lattice-data.org"
MAX_CHARS = 40000  # the submitter's cap per cell; Sheets allows 50,000


def fetch_uuids(endpoint, object_type, count):
    """uuids of up to `count` objects of `object_type`, and how many there are."""
    query = urllib.parse.urlencode({"type": object_type, "field": "uuid", "limit": count, "format": "json"})
    url = f"{endpoint.rstrip('/')}/search/?{query}"
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    key, secret = os.environ.get("LATTICE_KEY"), os.environ.get("LATTICE_SECRET")
    if key and secret:
        token = base64.b64encode(f"{key}:{secret}".encode()).decode()
        request.add_header("Authorization", f"Basic {token}")
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            result = json.load(response)
    except (urllib.error.URLError, ValueError) as error:
        sys.exit(f"could not read {url}: {error}")
    uuids = [item["uuid"] for item in result.get("@graph", []) if item.get("uuid")]
    return uuids, result.get("total", len(uuids))


def make_aliases(lab, count):
    run = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    return [f"{lab}:long-list-test-{run}-{i + 1:05d}" for i in range(count)]


def split_for_cells(items, max_chars):
    """JSON strings for `items` in parts that each fit in max_chars, as the sheet splits them."""
    parts, current, length = [], [], 2
    for item in items:
        item_length = len(json.dumps(item))
        separator = 1 if current else 0
        if current and length + separator + item_length > max_chars:
            parts.append(current)
            current, length, separator = [], 2, 0
        current.append(item)
        length += separator + item_length
    parts.append(current)
    return [json.dumps(part, separators=(",", ":")) for part in parts]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT, help=f"portal API (default {DEFAULT_ENDPOINT})")
    parser.add_argument("--prop", default="derived_from", help="the list property; 'aliases' makes values up")
    parser.add_argument("--type", default="File", help="object type whose uuids fill a list of links")
    parser.add_argument("--count", type=int, default=2500, help="items in the list")
    parser.add_argument("--spare", type=int, default=2, help="extra items kept out of the list, for an append test")
    parser.add_argument("--lab", default="lattice", help="alias prefix for --prop aliases")
    parser.add_argument("--out-dir", default="dev/long-list-cells")
    parser.add_argument("--max-chars", type=int, default=MAX_CHARS)
    args = parser.parse_args()

    wanted = args.count + args.spare
    if args.prop == "aliases":
        items = make_aliases(args.lab, wanted)
        source = f"made-up aliases with prefix {args.lab}:"
    else:
        items, total = fetch_uuids(args.endpoint, args.type, wanted)
        source = f"uuids of {args.type} objects on {args.endpoint} ({total} there)"
        if len(items) < wanted:
            print(f"warning: only {len(items)} {args.type} objects found, asked for {wanted}", file=sys.stderr)
    spare, items = items[args.count:], items[: args.count]

    parts = split_for_cells(items, args.max_chars)
    headers = [args.prop if i == 0 else f"{args.prop}#{i + 1}" for i in range(len(parts))]
    os.makedirs(args.out_dir, exist_ok=True)
    for header, part in zip(headers, parts):
        with open(os.path.join(args.out_dir, f"{header}.txt"), "w") as f:
            f.write(part)
    with open(os.path.join(args.out_dir, "row.tsv"), "w") as f:
        f.write("\t".join(headers) + "\n" + "\t".join(parts) + "\n")

    print(f"{len(items)} items: {source}")
    print(f"{len(parts)} column(s), each at most {args.max_chars:,} characters:\n")
    for header, part in zip(headers, parts):
        path = os.path.join(args.out_dir, f"{header}.txt")
        print(f'  {header:<20} {len(json.loads(part)):>5} items {len(part):>6} chars   pbcopy < "{path}"')
    if spare:
        print("\nspare items, not in the list, for the append test:")
        for item in spare:
            print(f"  {item}")
    print(f"\nrow.tsv (a header line and one row) is in {args.out_dir}/ for File > Import.")


if __name__ == "__main__":
    main()
