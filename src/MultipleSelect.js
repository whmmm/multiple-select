import Constants from './constants/index.js'
import {
  compareObjects,
  removeDiacritics,
  findByParam,
  setDataKeys,
  removeUndefined
} from './utils/index.js'

class MultipleSelect {
  constructor ($el, options) {
    this.$el = $el
    this.options = $.extend({}, Constants.DEFAULTS, options)
  }

  init () {
    this.initLocale()
    this.initContainer()
    this.initData()
    this.initSelected(true)
    this.initFilter()
    this.initDrop()
    this.initView()
    this.options.onAfterCreate()
  }

  initLocale () {
    if (this.options.locale) {
      const {locales} = $.fn.multipleSelect
      const parts = this.options.locale.split(/-|_/)

      parts[0] = parts[0].toLowerCase()
      if (parts[1]) {
        parts[1] = parts[1].toUpperCase()
      }

      if (locales[this.options.locale]) {
        $.extend(this.options, locales[this.options.locale])
      } else if (locales[parts.join('-')]) {
        $.extend(this.options, locales[parts.join('-')])
      } else if (locales[parts[0]]) {
        $.extend(this.options, locales[parts[0]])
      }
    }
  }

  initContainer () {
    const el = this.$el[0]
    const name = el.getAttribute('name') || this.options.name || ''

    // hide select element
    this.$el.hide()

    // label element
    this.$label = this.$el.closest('label')
    if (!this.$label.length && this.$el.attr('id')) {
      this.$label = $(`label[for="${this.$el.attr('id')}"]`)
    }
    if (this.$label.find('>input').length) {
      this.$label = null
    }

    // restore class and title from select element
    this.$parent = $(`
      <div class="ms-parent ${el.getAttribute('class') || ''}"
      title="${el.getAttribute('title') || ''}" />
    `)

    // add placeholder to choice button
    this.options.placeholder = this.options.placeholder ||
      el.getAttribute('placeholder') || ''

    this.$choice = $(`
      <button type="button" class="ms-choice">
      <span class="placeholder">${this.options.placeholder}</span>
      <div></div>
      </button>
    `)

    // default position is bottom
    this.$drop = $(`<div class="ms-drop ${this.options.position}" />`)

    if (this.options.dropWidth) {
      this.$drop.css('width', this.options.dropWidth)
    }

    this.$el.after(this.$parent)
    this.$parent.append(this.$choice)
    this.$parent.append(this.$drop)

    if (el.disabled) {
      this.$choice.addClass('disabled')
    }

    this.selectAllName = `data-name="selectAll${name}"`
    this.selectGroupName = `data-name="selectGroup${name}"`
    this.selectItemName = `data-name="selectItem${name}"`

    if (!this.options.keepOpen) {
      $(document).click(e => {
        if (
          $(e.target)[0] === this.$choice[0] ||
          $(e.target).parents('.ms-choice')[0] === this.$choice[0]
        ) {
          return
        }
        if (
          ($(e.target)[0] === this.$drop[0] ||
          ($(e.target).parents('.ms-drop')[0] !== this.$drop[0] &&
          e.target !== el)) &&
          this.options.isOpen
        ) {
          this.close()
        }
      })
    }
  }

  initData () {
    const data = []

    if (this.options.data) {
      if (Array.isArray(this.options.data)) {
        this.data = this.options.data.map(it => {
          if (typeof it === 'string' || typeof it === 'number') {
            return {
              text: it,
              value: it
            }
          }
          return it
        })
      } else if (typeof this.options.data === 'object') {
        for (const [value, text] of Object.entries(this.options.data)) {
          data.push({
            value,
            text
          })
        }
        this.data = data
      }
    } else {
      $.each(this.$el.children(), (i, elm) => {
        const row = this.initRow(i, elm)
        if (row) {
          data.push(this.initRow(i, elm))
        }
      })

      this.options.data = data
      this.data = data
      this.fromHtml = true
    }

    setDataKeys(this.data)
  }

  initRow (i, elm, groupDisabled) {
    const row = {}
    const $elm = $(elm)

    if ($elm.is('option')) {
      row.type = 'option'
      row.text = this.options.textTemplate($elm)
      row.value = elm.value
      row.visible = true
      row.selected = !!elm.selected
      row.disabled = groupDisabled || elm.disabled
      row.classes = elm.getAttribute('class') || ''
      row.title = elm.getAttribute('title') || ''
      if ($elm.data('value')) {
        row._value = $elm.data('value') // value for object
      }
      if (Object.keys($elm.data()).length) {
        row._data = $elm.data()
      }

      return row
    }

    if ($elm.is('optgroup')) {
      row.type = 'optgroup'
      row.label = this.options.labelTemplate($elm)
      row.visible = true
      row.selected = !!elm.selected
      row.disabled = elm.disabled
      row.children = []
      if (Object.keys($elm.data()).length) {
        row._data = $elm.data()
      }

      $.each($elm.children(), (j, elem) => {
        row.children.push(this.initRow(j, elem, row.disabled))
      })

      return row
    }

    return null
  }

  initSelected (ignoreTrigger) {
    let selectedTotal = 0

    for (const row of this.data) {
      if (row.type === 'optgroup') {
        const selectedCount = row.children.filter(child => {
          return child.selected && !child.disabled && child.visible
        }).length

        row.selected = selectedCount && selectedCount ===
          row.children.filter(child => !child.disabled && child.visible).length

        selectedTotal += selectedCount
      } else {
        selectedTotal += row.selected && !row.disabled && row.visible ? 1 : 0
      }
    }

    this.allSelected = this.data.filter(row => {
      return row.selected && !row.disabled && row.visible
    }).length === this.data.filter(row => !row.disabled && row.visible).length

    if (!ignoreTrigger) {
      if (this.allSelected) {
        this.options.onCheckAll()
      } else if (selectedTotal === 0) {
        this.options.onUncheckAll()
      }
    }
  }

  initFilter () {
    if (this.options.filter || !this.options.filterByDataLength) {
      return
    }

    let length = 0
    for (const option of this.data) {
      if (option.type === 'optgroup') {
        length += option.children.length
      } else {
        length += 1
      }
    }

    this.options.filter = length > this.options.filterByDataLength
  }

  initDrop () {
    this.initList()
    this.events()
    this.update(true)

    if (this.options.isOpen) {
      setTimeout(() => {
        this.open()
      }, 50)
    }

    if (this.options.openOnHover) {
      this.$parent.hover(() => {
        this.open()
      }, () => {
        this.close()
      })
    }
  }

  initList () {
    const html = []

    if (this.options.filter) {
      html.push(`
        <div class="ms-search">
          <input type="text" autocomplete="off" autocorrect="off"
            autocapitalize="off" spellcheck="false"
            placeholder="${this.options.filterPlaceholder}">
        </div>
      `)
    }

    html.push('<ul>')

    if (this.options.selectAll && !this.options.single) {
      html.push(`
        <li class="ms-select-all">
        <label>
        <input type="checkbox" ${this.selectAllName}${this.allSelected ? ' checked="checked"' : ''} />
        <span>${this.options.formatSelectAll()}</span>
        </label>
        </li>
      `)
    }

    html.push(this.data.map(row => {
      return this.initListItem(row)
    }).join(''))

    html.push(`<li class="ms-no-results">${this.options.formatNoMatchesFound()}</li>`)

    html.push('</ul>')

    this.$drop.html(html.join(''))
    this.$drop.find('>ul').css('max-height', `${this.options.maxHeight}px`)
    this.$drop.find('.multiple').css('width', `${this.options.multipleWidth}px`)

    this.$searchInput = this.$drop.find('.ms-search input')
    this.$selectAll = this.$drop.find(`input[${this.selectAllName}]`)
    this.$selectGroups = this.$drop.find(`input[${this.selectGroupName}],span[${this.selectGroupName}]`)
    this.$selectItems = this.$drop.find(`input[${this.selectItemName}]:enabled`)
    this.$disableItems = this.$drop.find(`input[${this.selectItemName}]:disabled`)
    this.$noResults = this.$drop.find('.ms-no-results')
  }

  initListItem (row, level = 0) {
    const title = row.title ? `title="${row.title}"` : ''
    const multiple = this.options.multiple ? 'multiple' : ''
    const type = this.options.single ? 'radio' : 'checkbox'
    let classes = ''

    if (this.options.single && !this.options.singleRadio) {
      classes = 'hide-radio '
    }

    if (row.selected) {
      classes += 'selected '
    }

    if (row.type === 'optgroup') {
      const customStyle = this.options.styler(row)
      const style = customStyle ? `style="${customStyle}"` : ''
      const html = []
      const group = this.options.hideOptgroupCheckboxes || this.options.single ?
        `<span ${this.selectGroupName} data-key="${row._key}"></span>` :
        `<input type="checkbox"
          ${this.selectGroupName}
          data-key="${row._key}"
          ${row.selected ? ' checked="checked"' : ''}
          ${row.disabled ? ' disabled="disabled"' : ''}
        >`

      if (
        !classes.includes('hide-radio') &&
        (this.options.hideOptgroupCheckboxes || this.options.single)
      ) {
        classes += 'hide-radio '
      }

      html.push(`
        <li class="group ${classes}" ${style}>
        <label class="optgroup${row.disabled ? ' disabled' : ''}">
        ${group}${row.label}
        </label>
        </li>
      `)

      html.push(row.children.map(child => {
        return this.initListItem(child, 1)
      }).join(''))

      return html.join('')
    }

    const customStyle = this.options.styler(row)
    const style = customStyle ? `style="${customStyle}"` : ''
    classes += row.classes || ''

    if (level && this.options.single) {
      classes += `option-level-${level} `
    }

    return `
      <li class="${multiple} ${classes}" ${title} ${style}>
      <label class="${row.disabled ? 'disabled' : ''}">
      <input type="${type}"
        value="${row.value}"
        data-key="${row._key}"
        ${this.selectItemName}
        ${row.selected ? ' checked="checked"' : ''}
        ${row.disabled ? ' disabled="disabled"' : ''}
      >
      <span>${row.text}</span>
      </label>
      </li>
    `
  }

  events () {
    const toggleOpen = e => {
      e.preventDefault()
      this[this.options.isOpen ? 'close' : 'open']()
    }

    if (this.$label && this.$label.length) {
      this.$label.off('click').on('click', e => {
        if (e.target.nodeName.toLowerCase() !== 'label') {
          return
        }
        toggleOpen(e)
        if (!this.options.filter || !this.options.isOpen) {
          this.focus()
        }
        e.stopPropagation() // Causes lost focus otherwise
      })
    }

    this.$choice.off('click').on('click', toggleOpen)
      .off('focus').on('focus', this.options.onFocus)
      .off('blur').on('blur', this.options.onBlur)

    this.$parent.off('keydown').on('keydown', e => {
      // esc key
      if (e.which === 27 && !this.options.keepOpen) {
        this.close()
        this.$choice.focus()
      }
    })

    this.$searchInput.off('keydown').on('keydown', e => {
      // Ensure shift-tab causes lost focus from filter as with clicking away
      if (e.keyCode === 9 && e.shiftKey) {
        this.close()
      }
    }).off('keyup').on('keyup', e => {
      // enter or space
      // Avoid selecting/deselecting if no choices made
      if (
        this.options.filterAcceptOnEnter &&
        [13, 32].includes(e.which) &&
        this.$searchInput.val()
      ) {
        if (this.options.single) {
          const $items = this.$selectItems.closest('li').filter(':visible')
          if ($items.length) {
            this.setSelects([$items.first().find(`input[${this.selectItemName}]`).val()])
          }
        } else {
          this.$selectAll.click()
        }
        this.close()
        this.focus()
        return
      }
      this.filter()
    })

    this.$selectAll.off('click').on('click', e => {
      this._checkAll($(e.currentTarget).prop('checked'))
    })

    this.$selectGroups.off('click').on('click', e => {
      const $this = $(e.currentTarget)
      const checked = $this.prop('checked')
      const group = findByParam(this.data, '_key', $this.data('key'))

      this._checkGroup(group, checked)
      this.options.onOptgroupClick(removeUndefined({
        label: group.label,
        selected: group.selected,
        data: group._data,
        children: group.children.map(child => {
          return removeUndefined({
            text: child.text,
            value: child.value,
            selected: child.selected,
            disabled: child.disabled,
            data: child._data
          })
        })
      }))
    })

    this.$selectItems.off('click').on('click', e => {
      const $this = $(e.currentTarget)
      const checked = $this.prop('checked')
      const option = findByParam(this.data, '_key', $this.data('key'))

      this._check(option, checked)
      this.options.onClick(removeUndefined({
        text: option.text,
        value: option.value,
        selected: option.selected,
        data: option._data
      }))

      if (this.options.single && this.options.isOpen && !this.options.keepOpen) {
        this.close()
      }
    })
  }

  initView () {
    let computedWidth

    if (window.getComputedStyle) {
      computedWidth = window.getComputedStyle(this.$el[0]).width

      if (computedWidth === 'auto') {
        computedWidth = this.$drop.outerWidth() + 20
      }
    } else {
      computedWidth = this.$el.outerWidth() + 20
    }

    this.$parent.css('width', this.options.width || computedWidth)

    this.$el.show().addClass('ms-offscreen')
  }

  open () {
    if (this.$choice.hasClass('disabled')) {
      return
    }
    this.options.isOpen = true
    this.$choice.find('>div').addClass('open')
    this.$drop[this.animateMethod('show')]()

    // fix filter bug: no results show
    this.$selectAll.parent().show()
    this.$noResults.hide()

    // Fix #77: 'All selected' when no options
    if (!this.data.length) {
      this.$selectAll.parent().hide()
      this.$noResults.show()
    }

    if (this.options.container) {
      const offset = this.$drop.offset()
      this.$drop.appendTo($(this.options.container))
      this.$drop.offset({
        top: offset.top,
        left: offset.left
      })
        .css('min-width', 'auto')
        .outerWidth(this.$parent.outerWidth())
    }

    if (this.data.length && this.options.filter) {
      this.$searchInput.val('')
      this.$searchInput.focus()
      this.filter(true)
    }
    this.options.onOpen()
  }

  close () {
    this.options.isOpen = false
    this.$choice.find('>div').removeClass('open')
    this.$drop[this.animateMethod('hide')]()
    if (this.options.container) {
      this.$parent.append(this.$drop)
      this.$drop.css({
        'top': 'auto',
        'left': 'auto'
      })
    }
    this.options.onClose()
  }

  animateMethod (method) {
    const methods = {
      show: {
        fade: 'fadeIn',
        slide: 'slideDown'
      },
      hide: {
        fade: 'fadeOut',
        slide: 'slideUp'
      }
    }

    return methods[method][this.options.animate] || method
  }

  update (ignoreTrigger) {
    const valueSelects = this.getSelects()
    let textSelects = this.getSelects('text')

    if (this.options.displayValues) {
      textSelects = valueSelects
    }

    const $span = this.$choice.find('>span')
    const sl = valueSelects.length
    let html = ''

    if (sl === 0) {
      $span.addClass('placeholder').html(this.options.placeholder)
    } else if (sl < this.options.minimumCountSelected) {
      html = textSelects.join(this.options.displayDelimiter)
    } else if (this.options.formatAllSelected() && sl === this.$selectItems.length + this.$disableItems.length) {
      html = this.options.formatAllSelected()
    } else if (this.options.ellipsis && sl > this.options.minimumCountSelected) {
      html = `${textSelects.slice(0, this.options.minimumCountSelected)
        .join(this.options.displayDelimiter)}...`
    } else if (this.options.formatCountSelected() && sl > this.options.minimumCountSelected) {
      html = this.options.formatCountSelected(
        sl, this.$selectItems.length + this.$disableItems.length
      )
    } else {
      html = textSelects.join(this.options.displayDelimiter)
    }

    if (html) {
      $span.removeClass('placeholder').html(html)
    }

    if (this.options.displayTitle) {
      $span.prop('title', this.getSelects('text'))
    }

    // set selects to select
    this.$el.val(this.getSelects())

    // trigger <select> change event
    if (!ignoreTrigger) {
      this.$el.trigger('change')
    }
  }

  updateSelected () {
    for (const row of this.data) {
      this.$drop.find(`input[data-key=${row._key}]`).prop('checked', row.selected)
        .closest('li').toggleClass('selected', row.selected)
        .toggle(row.visible)

      this.$drop.find(`span[data-key=${row._key}]`)
        .closest('li').toggle(row.visible)

      if (row.type === 'optgroup') {
        for (const child of row.children) {
          this.$drop.find(`[data-key=${child._key}]`).prop('checked', child.selected)
            .closest('li').toggleClass('selected', child.selected)
            .toggle(child.visible)
        }
      }
    }

    const noResult = this.data.filter(row => row.visible).length === 0

    this.$selectAll.prop('checked', this.allSelected)
      .closest('li').toggle(!noResult)
    this.$noResults.toggle(noResult)
  }

  getOptions () {
    // deep copy and remove data
    const options = $.extend({}, this.options)
    delete options.data
    return $.extend(true, {}, options)
  }

  refreshOptions (options) {
    // If the objects are equivalent then avoid the call of destroy / init methods
    if (compareObjects(this.options, options, true)) {
      return
    }
    this.options = $.extend(this.options, options)
    this.destroy()
    this.init()
  }

  // value html, or text, default: 'value'
  getSelects (type = 'value') {
    const values = []
    for (const row of this.data) {
      if (row.type === 'optgroup') {
        const selectedChildren = row.children.filter(child => child.selected)
        if (!selectedChildren.length) {
          continue
        }

        if (type === 'value' || this.options.single) {
          values.push(...selectedChildren.map(child => {
            return type === 'value' ? child._value || child[type] : child[type]
          }))
        } else {
          const value = []
          value.push('[')
          value.push(row.label)
          value.push(`: ${selectedChildren.map(child => child[type]).join(', ')}`)
          value.push(']')
          values.push(value.join(''))
        }
      } else if (row.selected) {
        values.push(type === 'value' ? row._value || row[type] : row[type])
      }
    }
    return values
  }

  setSelects (values, ignoreTrigger) {
    let hasChanged = false
    const _setSelects = rows => {
      for (const row of rows) {
        let selected = values.includes(row._value || row.value)
        if (!selected && row.value === +row.value + '') {
          selected = values.includes(+row.value)
        }
        if (row.selected !== selected) {
          hasChanged = true
        }
        row.selected = selected
      }
    }

    for (const row of this.data) {
      if (row.type === 'optgroup') {
        _setSelects(row.children)
      } else {
        _setSelects([row])
      }
    }

    if (hasChanged) {
      this.updateSelected()
      this.update(ignoreTrigger)
    }
  }

  enable () {
    this.$choice.removeClass('disabled')
  }

  disable () {
    this.$choice.addClass('disabled')
  }

  check (value) {
    const option = findByParam(this.data, 'value', value)
    if (!option) {
      return
    }
    this._check(option, true)
  }

  uncheck (value) {
    const option = findByParam(this.data, 'value', value)
    if (!option) {
      return
    }
    this._check(option, false)
  }

  _check (option, checked) {
    if (this.options.single) {
      this._checkAll(false, true)
    }
    option.selected = checked
    this.initSelected()
    this.updateSelected()
    this.update()
  }

  checkAll () {
    this._checkAll(true)
  }

  uncheckAll () {
    this._checkAll(false)
  }

  _checkAll (checked, ignoreUpdate) {
    for (const row of this.data) {
      if (row.type === 'optgroup') {
        this._checkGroup(row, checked, true)
      } else if (!row.disabled && (ignoreUpdate || row.visible)) {
        row.selected = checked
      }
    }

    if (!ignoreUpdate) {
      this.initSelected()
      this.updateSelected()
      this.update()
    }
  }

  _checkGroup (group, checked, ignoreUpdate) {
    group.selected = checked
    group.children.forEach(row => {
      if (!row.disabled && (ignoreUpdate || row.visible)) {
        row.selected = checked
      }
    })

    if (!ignoreUpdate) {
      this.initSelected()
      this.updateSelected()
      this.update()
    }
  }

  checkInvert () {
    if (this.options.single) {
      return
    }
    for (const row of this.data) {
      if (row.type === 'optgroup') {
        for (const child of row.children) {
          child.selected = !child.selected
        }
      } else {
        row.selected = !row.selected
      }
    }
    this.initSelected()
    this.updateSelected()
    this.update()
  }

  focus () {
    this.$choice.focus()
    this.options.onFocus()
  }

  blur () {
    this.$choice.blur()
    this.options.onBlur()
  }

  refresh () {
    this.destroy()
    this.init()
  }

  filter (ignoreTrigger) {
    const originalText = $.trim(this.$searchInput.val())
    const text = originalText.toLowerCase()

    for (const row of this.data) {
      if (row.type === 'optgroup') {
        if (this.options.filterGroup) {
          const visible = this.options.customFilter(
            removeDiacritics(row.label.toLowerCase()),
            removeDiacritics(text),
            row.label, originalText)

          row.visible = visible
          for (const child of row.children) {
            child.visible = visible
          }
        } else {
          for (const child of row.children) {
            child.visible = this.options.customFilter(
              removeDiacritics(child.text.toLowerCase()),
              removeDiacritics(text),
              child.text, originalText)
          }
          row.visible = row.children.filter(child => child.visible).length > 0

          console.log(row.visible)
        }
      } else {
        row.visible = this.options.customFilter(
          removeDiacritics(row.text.toLowerCase()),
          removeDiacritics(text),
          row.text, originalText)
      }
    }

    this.initSelected(true)
    this.updateSelected()

    if (!ignoreTrigger) {
      this.options.onFilter(text)
    }
  }

  destroy () {
    if (!this.$parent) {
      return
    }
    this.$el.before(this.$parent).removeClass('ms-offscreen')
    this.$parent.remove()

    if (this.fromHtml) {
      delete this.options.data
      this.fromHtml = false
    }
  }
}

export default MultipleSelect
