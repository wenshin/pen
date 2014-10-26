/*! Licensed under MIT, https://github.com/wenshin/automd */

(function(win) {

  var doc = win.document;
  var Utils = win.Utils = {};

  Utils.Event = {
    selection: doc.getSelection(),
    _keyMap: {
      '96': '`', '62': '>', '49': '1', '46': '.', '45': '-', '42': '*', '35': '#',
      '32': 'Space', '13': 'Enter', '9': 'Tab', '27': 'Esc', '8': 'Backspace',
      '16': 'Shift', '17': 'Control', '18': 'Alt'
    },

    on: (function(elem, type, handler) {
      if ( doc.addEventListener ) {
        // for except IE
        return function (elem, type, handler) {
          elem.addEventListener(type, handler, false);
        }
      } else if ( doc.attachEvent ) {
        // for IE
        return function (elem, type, handler) {
          elem.attachEvent('on' + type, handler);
        }
      } else {
        // fallback to DOM0 event
        return function (elem, type, handler) {
          elem['on' + type] = handler;
        }
      }
    })(),

    off: (function (elem, type, handler) {
      if ( doc.removeEventListener ) {
        return function (elem, type, handler) {
          elem.removeEventListener(type, handler, false);
        }
      } else if ( doc.detachEvent ) {
        return function (elem, type, handler) {
          elem.detachEvent('on' + type, handler);
        }
      } else {
        return function (elem, type, handler) {
          elem['on' + type] = null;
        }
      }
    })(),

    trigger: function () {},

    // 给event对象扩展pressing函数, key、range属性
    extend: function (e) {
      var upper = this;
      var code = e.keyCode || e.which;
      e.key = upper._keyMap[code];
      e.pressing = function (keyName) {
        return upper._pressing(code, keyName);
      };
      e.range = this.selection.getRangeAt(0);
      return e;
    },
    _pressing: function ( code, keyName ) {
      return this._keyMap[code] === keyName;
    }
  };


  Utils.Dom = {
    _nodeMap: {
      1: 'ELEMENT_NODE',
      2: 'ATTRIBUTE_NODE',
      3: 'TEXT_NODE',
      4: 'CDATA_SECTION_NODE',
      5: 'ENTITY_REFERENCE_NODE',
      6: 'ENTITY_NODE',
      7: 'PROCESSING_INSTRUCTION_NODE',
      8: 'COMMENT_NODE',
      9: 'DOCUMENT_NODE',
      10: 'DOCUMENT_TYPE_NODE',
      11: 'DOCUMENT_FRAGMENT_NODE',
      12: 'NOTATION_NODE'
    },
    isNode: function (node, name) {
      var nodeName = this._nodeMap[node.nodeType] || node.nodeName;
      return this._nodeMap[node.nodeType] === name;
    }
  };

  Utils.Log = {
    print: function(msg, type, force) {
      if ( Array.isArray(msg) ) {
        msg = msg.join(''); }
      type = type || 'log';
      if (force){
        console[type]('%c[AutoMD]: ' + msg,
          'font-family:arial,sans-serif;color:#1abf89;line-height:2em;');
      }
    }
  };


  var Editor = function(elem) {
    this.elem = elem;
  };

  Editor.exec = function(cmd, value) {
    if ( !doc.queryCommandEnabled(cmd) ) {
      Utils.Log.print(['The Command [', cmd, '] not exist.'], 'error');
      return false;
    }
    value = value || null;
    doc.execCommand(cmd, false, value);
    return doc.queryCommandState(cmd); // true success, false fail
  };

  Editor.prototype.on = function(eventType, handler) {
    Utils.Event.on(this.elem, eventType, handler);
  };

  Editor.prototype.off = function(eventType, handler) {
    Utils.Event.off(this.elem, eventType, handler);
  };


  Editor.prototype.bold = function() {
    // Tips:
    //   不同的浏览器该命令生成的标签会不一致，chrome、safari 生成b
    //   firfox 生成 span，IE、Opera 生成 strong
    //   在CSS设置样式时需要注意！！
    return Editor.exec('bold');
  };

  Editor.prototype.text = function(type, value) {
    // Usage:
    // editor.text('backcolor', '#fff')
    // editor.text('forecolor', '#fff')
    // editor.text('fontname', 'Arial')
    // editor.text('indent')
    // editor.text('outdent')
    // editor.text('italic')
    // editor.text('underline')
    // editor.text('justifycenter')
    // editor.text('justifyleft')
    // editor.text('fontsize', '1')。fontsize 的值支持1-7
    return Editor.exec(type, value);
  };

  Editor.prototype.insert = function(tag, value) {
    // Usage:
    //   editor.insert('img', 'url')
    //   editor.insert('hr')
    //   editor.insert('ol')
    //   editor.insert('ul')
    //   editor.insert('p')
    var tagCmdMap = {
      hr: 'horizontalrule',
      img: 'image',
      ol: 'orderedlist',
      ul: 'unorderedlist',
      p: 'paragragh'
    };
    return Editor.exec('insert' + tagCmdMap[tag], value);
  };

  Editor.prototype.block = function(tag) {
    return Editor.exec('formatblock', '<' + tag + '>');
  };

  Editor.prototype.link = function(url) {
    return Editor.exec('createlink', url);
  };


  // markdown automd obj
  var automd = win.automd = {
    selection: doc.getSelection()
  };

  // return valid markdown syntax
  automd.parse = function (declare) {
    var cmd = { method: null, arg: null };

    if ( declare.match(/[#]{1,6}/) ) {
      cmd.method = 'block';
      cmd.arg = 'h' + declare.length;
    } else if ( declare === '```' ) {
      cmd.method = 'block';
      cmd.arg = 'pre';
    } else if ( declare === '>' ) {
      cmd.method = 'block';
      cmd.arg = 'blockquote';
    } else if ( declare === '1.' ) {
      cmd.method = 'insert';
      cmd.arg = 'ol';
    } else if ( declare === '-' || declare === '*' ) {
      cmd.method = 'insert';
      cmd.arg = 'ul';
    } else if ( declare.match(/(?:\.|\*|\-){3,}/) ) {
      cmd.method = 'insert';
      cmd.arg = 'hr';
    }

    return cmd;
  };

  // Delete markdown symbols after rendered to html
  automd._clearDeclaration = function () {
    // After run execCommand the range was reset, so need run
    // getRangeAt again.
    var curRange = this.selection.getRangeAt(0);

    // The curRange must be collapsed, we need create a new rang
    // to delete markddown symbols contents.
    var range = doc.createRange();
    var node = curRange.startContainer;

    // 防止清空元素后容器高度变为0
    node.parentElement.appendChild(doc.createElement('br'));

    // 创建包括Markdown符号的选区并删除掉
    range.setStart(node, 0);
    range.setEnd(node, curRange.startOffset);
    range.deleteContents();

    // 在node最开始显示闪烁光标，实现focus的效果
    // 无法使用elem.focus()来显示光标：（
    var cursorRange = doc.createRange();
    cursorRange.setStart(node, 0);
    cursorRange.setEnd(node, 0);
    this.selection.removeAllRanges();
    this.selection.addRange(cursorRange);
  };

  // TIPs:
  // 1. 输入汉字时，chrome keydown的code是229，keyup是正确的code，
  //    但是不同平台和不同版本可能不一致!
  // 2. 输入汉字可以用空格结尾，也可以用鼠标点击结尾，鼠标点击结尾就没有keyup事件


  automd.init = function(editor) {
    // Just triggered input method in english mode,
    // But Space can triggered when Chinese Mode

    var upper = this;
    editor.on('keypress', function(e) {
      e = Utils.Event.extend(e);
      var declare, cmd;
      var node = e.range.startContainer;

      if ( e.pressing('Space') && Utils.Dom.isNode(node, 'TEXT_NODE') ) {
        declare = node.textContent.slice(0, e.range.startOffset).trim();
        cmd = automd.parse(declare);
        if ( cmd.method && cmd.arg ) {
          // Prevent to input Space
          e.preventDefault();
          editor[cmd.method](cmd.arg);
          automd._clearDeclaration(e);
        }
      }

      // TODO:
      //   2. =====, ----- 及时显示

      // Tips:
      //   1. Pre, Blockquote 标签模块内换行是使用shift+enter(windows，linux)
      //   2. ul,ol 第一次Enter是在ul内新建一个li，马上再按一次Enter这退出当前ul区域。
      //      Shift+Enter是在li元素内换行

      // if ( e.pressing('Enter') ) {
      //   if ( node.parentElement )
      //     e.preventDefault();
      // }

      console.log('keypress: ' + e.which);
    });

    editor.on('keyup', function(e) {
      console.log('keyup: ' + e.which);
    });

    editor.on('keydown', function(e) {
      console.log('keydown: ' + e.which);
    });

    // Change event will trigger when blured
    editor.on('change', function(e) {
      console.log('change');
    });

    editor.on('textinput', function(e) {
      console.log('textinput');
    });

  };

  // append to editor
  win.AutoMD = automd;
  win.Editor = Editor;

}(window));


window.AutoMD.init(new Editor(document.querySelector('[data-toggle="pen"]')));
