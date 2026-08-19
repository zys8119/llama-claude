import React, { useState, useEffect } from "react";
import { Text, useInput, Box } from "ink";


class TextBuffer {

  lines: string[] = [""];
  row = 0;
  col = 0;


  getLines() {
    return [...this.lines];
  }


  getText() {
    return this.lines.join("\n");
  }


  insert(text: string) {

    const line = this.lines[this.row];

    this.lines[this.row] =
      line.slice(0, this.col)
      + text
      + line.slice(this.col);

    this.col += text.length;
  }


  newline() {

    const line = this.lines[this.row];

    const left =
      line.slice(0, this.col);

    const right =
      line.slice(this.col);


    this.lines.splice(
      this.row,
      1,
      left,
      right
    );


    this.row++;
    this.col = 0;
  }



  backspace() {

    // 删除当前字符前面
    if (this.col > 0) {

      const line =
        this.lines[this.row];


      this.lines[this.row] =
        line.slice(0, this.col - 1)
        +
        line.slice(this.col);


      this.col--;

      return;
    }


    // 行首合并上一行
    if (this.row > 0) {

      const prev =
        this.lines[this.row - 1];

      const current =
        this.lines[this.row];


      this.col = prev.length;


      this.lines.splice(
        this.row - 1,
        2,
        prev + current
      );


      this.row--;
    }

  }



  delete() {

    const line =
      this.lines[this.row];


    // 删除光标后的字符
    if (this.col < line.length) {

      this.lines[this.row] =
        line.slice(0, this.col)
        +
        line.slice(this.col + 1);

      return;
    }



    // 合并下一行
    if (
      this.row <
      this.lines.length - 1
    ) {

      this.lines[this.row] +=
        this.lines[this.row + 1];


      this.lines.splice(
        this.row + 1,
        1
      );
    }

  }



  left() {
    if (this.col > 0)
      this.col--;
  }


  right() {

    if (
      this.col <
      this.lines[this.row].length
    )
      this.col++;

  }


  up() {

    if (this.row > 0) {

      this.row--;

      this.col = Math.min(
        this.col,
        this.lines[this.row].length
      );

    }

  }


  down() {

    if (
      this.row <
      this.lines.length - 1
    ) {

      this.row++;

      this.col = Math.min(
        this.col,
        this.lines[this.row].length
      );

    }

  }


  home() {
    this.col = 0;
  }


  end() {
    this.col =
      this.lines[this.row].length;
  }


  clear() {
    this.lines = [""];
    this.row = 0;
    this.col = 0;
  }

}

export default function Textarea(props: { ref: React.RefObject<any> }) {

  const [buffer] =
    useState(
      () => new TextBuffer()
    );


  const [, update] =
    useState(0);



  useInput(
    (input, key) => {


      // Enter 提交
      if (
        key.return &&
        !key.shift &&
        !key.meta
      ) {

        console.log(
          "\n提交:\n" +
          buffer.getText()
        );


        buffer.clear();

      }


      // Shift + Enter
      else if (
        key.return &&
        key.shift
      ) {

        buffer.newline();

      }


      // Alt + Enter
      else if (
        key.return &&
        key.meta
      ) {

        buffer.newline();

      }


      // Backspace
      else if (
        key.backspace ||
        input === "\x7f"
      ) {

        buffer.backspace();

      }


      // Delete
      else if (
        key.delete
      ) {

        buffer.delete();

      }


      // 左右
      else if (
        key.leftArrow
      ) {

        buffer.left();

      }

      else if (
        key.rightArrow
      ) {

        buffer.right();

      }


      // 上下
      else if (
        key.upArrow
      ) {

        buffer.up();

      }

      else if (
        key.downArrow
      ) {

        buffer.down();

      }


      // Home End
      else if (
        key.home
      ) {

        buffer.home();

      }

      else if (
        key.end
      ) {

        buffer.end();

      }


      // Ctrl+A
      else if (
        key.ctrl &&
        input === "a"
      ) {

        buffer.home();

      }


      // Ctrl+E
      else if (
        key.ctrl &&
        input === "e"
      ) {

        buffer.end();

      }


      // 普通输入
      else if (
        input &&
        !key.ctrl &&
        !key.meta
      ) {

        buffer.insert(input);

      }


      update(
        x => x + 1
      );

    }
  );



  const lines =
    buffer.getLines();
  props.ref.current = {
    buffer: buffer,
    lines: lines,
  }

  const {
    row,
    col
  } = buffer;

  return (

    <Box
      flexDirection="column"
      borderStyle="round"
      paddingX={1}
    >

      {
        lines.map(
          (line, index) => {

            if (
              index === row
            ) {

              return (
                <Text key={index}>

                  {line.slice(
                    0,
                    col
                  )}

                  <Text inverse>
                    {
                      line[col] ?? " "
                    }
                  </Text>

                  {line.slice(
                    col + 1
                  )}

                </Text>
              );

            }


            return (
              <Text key={index}>
                {line}
              </Text>
            );

          }
        )
      }

    </Box>

  );
}
