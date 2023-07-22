import { useCallback, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { useAtom } from "jotai";
import styled from "styled-components";

import Input from "../../../../../components/Input";
import LangIcon from "../../../../../components/LangIcon";
import { newItemAtom } from "../../../../../state";
import { PgExplorer } from "../../../../../utils/pg";
import { useKeybind, useOnClickOutside } from "../../../../../hooks";

export const NewItem = () => {
  const [el] = useAtom(newItemAtom);

  return el ? ReactDOM.createPortal(<NewItemInput />, el) : null;
};

const NewItemInput = () => {
  const [el, setEl] = useAtom(newItemAtom);

  const [itemName, setItemName] = useState("");
  const [error, setError] = useState(false);

  const newFileRef = useRef<HTMLDivElement>(null);

  const hide = useCallback(() => setEl(null), [setEl]);

  useOnClickOutside(newFileRef, hide);

  // Handle keybinds
  useKeybind(
    [
      {
        keybind: "Enter",
        handle: async () => {
          if (!itemName) return;

          setError(false);

          // Check if the command is coming from context menu
          const selected =
            PgExplorer.getCtxSelectedEl() ?? PgExplorer.getSelectedEl();
          const parentPath =
            PgExplorer.getParentPathFromEl(selected as HTMLDivElement) ??
            PgExplorer.PATHS.ROOT_DIR_PATH;

          const itemPath =
            parentPath +
            itemName +
            (PgExplorer.getItemTypeFromName(itemName).file ? "" : "/");

          try {
            // Create item
            await PgExplorer.newItem(itemPath);

            // Remove input
            setEl(null);

            // Reset Ctx Selected
            PgExplorer.removeCtxSelectedEl();

            // Select new file
            PgExplorer.setSelectedEl(PgExplorer.getElFromPath(itemPath));
          } catch (e: any) {
            console.log(e.message);
            setError(true);
          }
        },
      },
      {
        keybind: "Escape",
        handle: () => {
          setEl(null);
        },
      },
    ],
    [itemName]
  );

  const depth = useMemo(() => {
    if (!el) return 0;
    let path = PgExplorer.getItemPathFromEl(el.firstChild as HTMLDivElement);
    const isEmptyFolder = !path;

    // Empty folder
    if (!path) {
      path = PgExplorer.getItemPathFromEl(
        el.parentElement?.firstChild as HTMLDivElement
      );
      if (!path) return 2;
    }
    const itemType = PgExplorer.getItemTypeFromPath(path);

    // Make `path` relative for consistency between temporary and normal projects
    if (PgExplorer.isTemporary) path = path.slice(1);
    else path = PgExplorer.getRelativePath(path);

    return path.split("/").length - (itemType.file || isEmptyFolder ? 0 : 1);
  }, [el]);

  return (
    <Wrapper ref={newFileRef} depth={depth}>
      <LangIcon fileName={itemName} />
      <Input
        autoFocus
        onChange={(ev) => {
          setItemName(ev.target.value);
          setError(false);
        }}
        error={error}
        setError={setError}
      />
    </Wrapper>
  );
};

const Wrapper = styled.div<{ depth: number }>`
  display: flex;
  align-items: center;
  padding: 0.25rem 0;
  padding-left: ${({ depth }) => depth + "rem"};

  & > input {
    margin-left: 0.375rem;
  }
`;