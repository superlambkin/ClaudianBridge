#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
_chroma_inspect.py — ChromaDB 閲覧・検索 CLI（claudian-bridge / chroma-inspector 用）

claudian-bridge の Chroma Database Browser / Test 接続 から spawn される Python CLI。

## JSON 契約（共通エンベロープ）

    { "ok": true,  "data": {...}, "error": null }
    { "ok": false, "data": null,  "error": "<メッセージ>" }

## コマンド

    _chroma_inspect.py --json --path <chromaPath> list
    _chroma_inspect.py --json --path <chromaPath> get  --collection <c> --limit <n> --offset <o> [--ids a,b] [--where <json>]
    _chroma_inspect.py --json --path <chromaPath> where --collection <c> --limit <n> [--where <json>] [--key <text>]
    _chroma_inspect.py --json --path <chromaPath> query --collection <c> --text <q> -n <n> [--include metadatas,documents,distances] [--where <json>]
    _chroma_inspect.py --json version

設計書: 80_POC_Projects/POC_017_ClaudianBridge/02_設計文書/05_API設計.md（2.3 chroma-runner）
"""

import argparse
import json
import sys

# Windows の Python は stdout が GBK/cp936 になるため、必ず UTF-8 に固定する
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass


def emit_ok(data):
    """成功時の JSON エンベロープを 1 行で stdout に出力して終了する。"""
    print(json.dumps({"ok": True, "data": data, "error": None}, ensure_ascii=False, default=str))
    sys.exit(0)


def fail(message):
    """エラーを JSON エンベロープで返して終了する（exit 1 でプラグインのエラー解析を発動させる）。"""
    print(json.dumps({"ok": False, "data": None, "error": str(message)}, ensure_ascii=False, default=str))
    sys.exit(1)


def parse_where(raw):
    """--where の JSON 文字列をパース。未指定 / 空は None。"""
    if not raw:
        return None
    try:
        where = json.loads(raw)
    except Exception as e:
        raise ValueError(f"--where JSON parse error: {e}")
    if not where:
        return None
    return where


def _at(items, index):
    """リストの index 要素を安全に取得（範囲外は None）。"""
    if items is None:
        return None
    try:
        return items[index]
    except (IndexError, TypeError):
        return None


def build_records(ids, metadatas, documents, embeddings=None, distances=None):
    """chromadb の get/query レスポンスをプラグインの ChromaRecord 形状に変換する。"""
    records = []
    total = len(ids) if ids else 0
    for i in range(total):
        records.append(
            {
                "id": _at(ids, i),
                "metadata": _at(metadatas, i),
                "document": _at(documents, i),
                "embedding": _at(embeddings, i) if embeddings is not None else None,
                "distance": _at(distances, i) if distances is not None else None,
            }
        )
    return records


def cmd_version(args):
    return {"version": "0.1.0", "hasPeek": False}


def cmd_list(client, args):
    collections = client.list_collections()
    return {
        "collections": [
            {"name": c.name, "count": c.count(), "metadata": c.metadata}
            for c in collections
        ]
    }


def cmd_get(client, args):
    collection = client.get_collection(args.collection)
    kwargs = {
        "limit": args.limit,
        "offset": args.offset,
        "include": ["metadatas", "documents"],
    }
    where = parse_where(args.where)
    if where is not None:
        kwargs["where"] = where
    if args.ids:
        kwargs["ids"] = [i.strip() for i in args.ids.split(",") if i.strip()]

    res = collection.get(**kwargs)
    records = build_records(
        res.get("ids") or [],
        res.get("metadatas") or [],
        res.get("documents") or [],
    )
    return {"records": records, "total": collection.count()}


def cmd_where(client, args):
    collection = client.get_collection(args.collection)
    kwargs = {
        "limit": args.limit,
        "offset": args.offset,
        "include": ["metadatas", "documents"],
    }
    where = parse_where(args.where)
    if where is not None:
        kwargs["where"] = where
    if args.key:
        kwargs["where_document"] = {"$contains": args.key}

    res = collection.get(**kwargs)
    records = build_records(
        res.get("ids") or [],
        res.get("metadatas") or [],
        res.get("documents") or [],
    )
    return {"records": records, "total": collection.count()}


def cmd_query(client, args):
    collection = client.get_collection(args.collection)
    include = (
        [x.strip() for x in args.include.split(",") if x.strip()]
        if args.include
        else ["metadatas", "documents", "distances"]
    )
    kwargs = {
        "query_texts": [args.text],
        "n_results": max(1, args.n),
        "include": include,
    }
    where = parse_where(args.where)
    if where is not None:
        kwargs["where"] = where

    res = collection.query(**kwargs)
    records = build_records(
        (res.get("ids") or [[]])[0],
        (res.get("metadatas") or [[]])[0],
        (res.get("documents") or [[]])[0],
        (res.get("embeddings") or [[]])[0] if "embeddings" in include else None,
        (res.get("distances") or [[]])[0] if "distances" in include else None,
    )
    return {"records": records, "total": len(records), "queryText": args.text}


def build_parser():
    parser = argparse.ArgumentParser(prog="_chroma_inspect.py")
    parser.add_argument("--json", action="store_true", help="JSON エンベロープを出力")
    parser.add_argument("--path", default=None, help="ChromaDB 永続化ディレクトリ")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("list", help="コレクション一覧")
    sub.add_parser("version", help="バージョン表示")

    for name in ("get", "where"):
        p = sub.add_parser(name, help=f"{name} レコード取得")
        p.add_argument("--collection", required=True)
        p.add_argument("--limit", type=int, default=5)
        p.add_argument("--offset", type=int, default=0)
        p.add_argument("--ids", default=None, help="カンマ区切り ID")
        p.add_argument("--where", default=None, help="メタデータ where フィルタ (JSON)")
        p.add_argument("--key", default=None, help="文書 $contains テキスト (where のみ)")

    q = sub.add_parser("query", help="セマンティック検索")
    q.add_argument("--collection", required=True)
    q.add_argument("--text", required=True)
    q.add_argument("-n", type=int, default=5)
    q.add_argument("--include", default="metadatas,documents,distances")
    q.add_argument("--where", default=None, help="メタデータ where フィルタ (JSON)")

    return parser


def main():
    args = build_parser().parse_args()

    if not args.json:
        fail("--json を指定してください")

    try:
        if args.command == "version":
            emit_ok(cmd_version(args))

        if not args.path:
            fail("--path は必須です")

        import chromadb

        client = chromadb.PersistentClient(path=args.path)

        if args.command == "list":
            data = cmd_list(client, args)
        elif args.command == "get":
            data = cmd_get(client, args)
        elif args.command == "where":
            data = cmd_where(client, args)
        elif args.command == "query":
            data = cmd_query(client, args)
        else:
            fail(f"不明なコマンド: {args.command}")

        emit_ok(data)
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001 — CLI は必ず JSON エンベロープを返す
        fail(e)


if __name__ == "__main__":
    main()
