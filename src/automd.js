/*! Licensed under MIT, https://github.com/wenshin/automd */

(function(win) {
  'use strict';

  // TIPs:
  // 1. 输入汉字时，chrome keydown的code是229，keyup是正确的code，
  //    但是不同平台和不同版本可能不一致!
  // 2. 输入汉字可以用空格结尾，也可以用鼠标点击结尾，鼠标点击结尾就没有keyup事件，
  //    safari 下中文输入法不能相应按键事件 - -！
  // 3. Chrome 中列表中两次回车后，会自动生成div，即使在p标签下也可以。
  //    按照html标准p下是不能嵌套其他标签的。这应该是Bug。需要想办法解决掉，
  //    不然重新显示的时候样式就乱掉了

  // Just triggered input method in english mode,
  // But Space can triggered when Chinese Mode

  // Tips:
  //   1. Pre, Blockquote 标签模块内换行是使用shift+enter(windows，linux)
  //   2. ul,ol 第一次Enter是在ul内新建一个li，马上再按一次Enter这退出当前ul区域。
  //      Shift+Enter是在li元素内换行

  // Features:
  // 1. 输入标题
  // 2. 输入副标题，支持align-right
  // 3. 上传图片
  // 4. 输入正文，支持选中加粗，改变颜色，添加链接
  // 5. 正文的标题大小比现有的小一个等级
  // 6. 插入列表，列表下嵌入列表、blockquote、pre。
  // 7. 插入代码，扩展支持不同语言高亮，不支持在pre下嵌入其他非代码标签
  // 8. 插入google趋势图
  // 9. 插入地理位置
  // 10. Wiki查询和提示
  // 11. 插入分割符，支持嵌入到p,div,blockquote等
  //
  // *** 以上模式下
  //   是否支持粘贴
  //   p标签下不能插入ul,ol,pre,div等


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
        };
      } else if ( doc.attachEvent ) {
        // for IE
        return function (elem, type, handler) {
          elem.attachEvent('on' + type, handler);
        };
      } else {
        // fallback to DOM0 event
        return function (elem, type, handler) {
          elem['on' + type] = handler;
        };
      }
    })(),

    off: (function (elem, type, handler) {
      if ( doc.removeEventListener ) {
        return function (elem, type, handler) {
          elem.removeEventListener(type, handler, false);
        };
      } else if ( doc.detachEvent ) {
        return function (elem, type, handler) {
          elem.detachEvent('on' + type, handler);
        };
      } else {
        return function (elem, type, handler) {
          elem['on' + type] = handler;
        };
      }
    })(),

    // 给event对象扩展pressing函数, key、range属性
    extend: function (e) {
      var upper = this;
      var code = e.keyCode || e.which;
      e.keyName = upper._keyMap[code];
      e.pressing = function (keyName) {
        return e.keyName === keyName;
      };
      e.range = this.selection.getRangeAt(0);
      return e;
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
      return nodeName === name;
    },
    hasAncestor: function(node, ancestorNodeName, endNode) {
      var n = node;
      while ( n.parentElement ) {
        n = n.parentElement;
        if ( n.nodeName === ancestorNodeName ) { return true; }
        if ( n === endNode ) { return false; }
      }
      return false;
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


  var Editor = function(event) {
    this.event = event;
    // 当前选区选中的节点
    this.node = event.range.startContainer;
    this.curRange = event.range;
    this.target = event.target;
    this.cmdType = null;
  };

  Editor.exec = function(cmd, value) {
    if ( !doc.queryCommandEnabled(cmd) ) {
      Utils.Log.print(['The Command [', cmd, '] not exist.'], 'error');
      return false;
    }
    value = value || null;
    return doc.execCommand(cmd, false, value); // true success, false fail
  };

  Editor.prototype.edit = function() {
    // @return: true 表示执行成功，false 执行失败
    var declare = this.getDeclare();
    if ( declare ) {
      if ( this._exec(declare) ) {
        this._clearDeclaration();
        return true;
      }
    }
    return false;
  };

  // Delete markdown symbols after rendered to html
  Editor.prototype._clearDeclaration = function () {
    // After run execCommand the range was reset, so need run
    // getRangeAt again.
    var selection = doc.getSelection();
    var curRange = selection.getRangeAt(0);

    // The curRange must be collapsed, we need create a new rang
    // to delete markddown symbols contents.
    var range = doc.createRange();
    var node = curRange.startContainer;

    if ( this.cmdType === 'block' ) {
      // 防止清空元素后容器高度变为0
      node.parentElement.appendChild(doc.createElement('br'));
    }

    // 创建包括Markdown符号的选区并删除掉
    range.setStart(node, 0);
    range.setEnd(node, curRange.startOffset);
    range.deleteContents();

    // 在node最开始显示闪烁光标，实现focus的效果
    // 无法使用elem.focus()来显示光标：（
    var cursorRange = doc.createRange();
    cursorRange.setStart(node, 0);
    cursorRange.setEnd(node, 0);
    selection.removeAllRanges();
    selection.addRange(cursorRange);
  };

  Editor.prototype.getDeclare = function() {
    if ( !Utils.Dom.isNode(this.node, 'TEXT_NODE') ) { return null; }
    return this.node.textContent.slice(0, this.curRange.startOffset).trim();
  };

  Editor.prototype._exec = function (declare) {
    if ( declare.match(/[#]{1,6}/) ) {
      this.cmdType = 'block';
      return this.block('h' + declare.length);
    } else if ( declare === '```' ) {
      this.cmdType = 'block';
      return this.block('pre');
    } else if ( declare === '>' ) {
      this.cmdType = 'block';
      return this.block('blockquote');
    } else if ( declare === '1.' ) {
      this.cmdType = 'insert';
      return this.insert('ol');
    } else if ( declare === '-' || declare === '*' ) {
      this.cmdType = 'insert';
      return this.insert('ul');
    } else if ( declare.match(/(?:\.|\*|\-){3,}/) ) {
      this.cmdType = 'insert';
      return this.insert('hr');
    }
    return false;
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
      hr: 'horizontalrule', // 默认支持嵌套插入
      img: 'image', // 默认支持嵌套插入
      ol: 'orderedlist',
      ul: 'unorderedlist',
      // 插入<br>，默认支持嵌套插入，连续插入<br>会导致重新渲染样式
      p: 'paragragh'
    };
    if ( !tagCmdMap[tag] ) { return false; }
    if ( Utils.Dom.hasAncestor(this.node, 'LI', this.target) ) {
      // TODO: 有Bug会新生成一个list，但不会删除当前的一行，而且光标停留在原始的位置
      return this.blockNestList(tag);
    } else {
      return Editor.exec('insert' + tagCmdMap[tag], value);
    }
  };

  Editor.prototype.block = function(tag) {
    return Editor.exec('formatblock', '<' + tag + '>');
  };

  Editor.prototype.blockNestList = function(tag) {
    // tag is 'ol' or 'li'
    var curRange = this.curRange,
        newRange = doc.createRange(),
        br = doc.createElement('br'),
        list = doc.createElement(tag),
        li = doc.createElement('li');
    curRange.surroundContents(li);
    curRange.selectNode(li);
    curRange.surroundContents(list);
    curRange.insertNode(br);
    return true;
  };

  Editor.prototype.link = function(url) {
    return Editor.exec('createlink', url);
  };

  Editor.prototype.alwaysNewPagraghWhenEnter = function() {
    var newRange = doc.createRange();
    var newSel = doc.getSelection();
    if ( Utils.Dom.isNode(this.node, 'DIV') ) {
      this.curRange.deleteContents();
      newRange.selectNode(doc.createElement('p'));
      newRange.insertNode(doc.createElement('br'));
      newSel.removeAllRanges();
      newSel.addRange(newRange);
    }
  };


  var MdEditor = function(options) {
    this.target = options.target;
  };

  MdEditor.prototype.init = function() {
    this._bindEvents();
  };

  MdEditor.prototype.on = function (type, fn) {
    Utils.Event.on(this.target, type, fn);
  };

  MdEditor.prototype.off = function(type, fn) {
    Utils.Event.off(this.target, type, fn);
  };

  MdEditor.prototype._bindEvents = function() {
    this.on('keypress', function(e){
      var editor;
      e = Utils.Event.extend(e);
      editor = new Editor(e);

      if ( e.pressing('Space') ) {
        if ( editor.edit() ) {
          // Prevent to input Space
          e.preventDefault();
        }
      }
      console.log('keypress: ' + (e.keyCode || e.which));
    });
    this.on('keydown', function(e){
      e = Utils.Event.extend(e);
      console.log('keydown: ' + (e.keyCode || e.which));
    });
    this.on('keyup', function(e){
      e = Utils.Event.extend(e);
      console.log('keyup: ' + (e.keyCode || e.which));
    });
    this.on('input', function(e){
      e = Utils.Event.extend(e);
      console.log('input: ' + (e.keyCode || e.which));
    });
    this.on('textinput', function(e){
      e = Utils.Event.extend(e);
      console.log('textinput: ' + (e.keyCode || e.which));
    });

  };

  win.MdEditor = MdEditor;

}(window));


var elem = document.querySelector('[data-toggle="pen"]');
var editor = new window.MdEditor({target: elem});
editor.init();
