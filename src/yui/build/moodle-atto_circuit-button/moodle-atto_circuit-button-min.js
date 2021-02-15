YUI.add("moodle-atto_circuit-button", function (t, e) {
    var i = {
            ISPERCENT: /\d+%/
        },
        o = M.cfg.wwwroot + "/lib/editor/atto/plugins/circuit/circuit.html",
        n = "circuitpad",
        r = {
            INPUTSUBMIT: "atto_circuit_submit",
            HGT: "height: 600px;",
            WDT: "width: 900px;"
        };
    t.namespace("M.atto_circuit").Button = t.Base.create("button", t.M.editor_atto.EditorPlugin, [], {
        initializer: function () {
            !this.get("host").canShowFilepicker("media") && this.get("storeinrepo") > 0 || this.addButton({
                icon: "circuit",
                iconComponent: "atto_circuit",
                buttonName: "Circtuit",
                callback: this._displayDialogue
            })
        },
        _convertImage: function (t) {
            var e;
            e = t.split(",")[0].indexOf("base64") >= 0 ? atob(t.split(",")[1]) : decodeURI(t.split(",")[1]);
            for (var i = t.split(",")[0].split(":")[1].split(";")[0], o = new Uint8Array(e.length), n = 0; n < e.length; n++) o[n] = e.charCodeAt(n);
            return new Blob([o], {
                type: i
            })
        },
        _doInsert: function (e) {
            console.log("go1");
            var i = this,
                o = this.get("host"),
                r = t.Handlebars.compile('<img src="{{url}}" alt="{{alt}}" {{#if width}}width="{{width}}" {{/if}}{{#if height}}height="{{height}}" {{/if}}{{#if presentation}}role="presentation" {{/if}}{{#if customstyle}}style="{{customstyle}}" {{/if}}{{#if classlist}}class="{{classlist}}" {{/if}}{{#if id}}id="{{id}}" {{/if}}/>');
            o.saveSelection(), e = e._event;
            var s = document.getElementById(n).contentWindow.document.getElementById("canvas"),
                a = i._convertImage(s.toDataURL());
            console.log(a);
            var l = a && a.size && "image/png" == a.type;
            if (console.log(l), l) {
                var c = o.get("filepickeroptions").image,
                    d = void 0 === c.savepath ? "/" : c.savepath,
                    u = new FormData,
                    g = 0,
                    p = "",
                    h = new XMLHttpRequest,
                    m = "",
                    f = Object.keys(c.repositories);
                e.preventDefault(), e.stopPropagation(), u.append("repo_upload_file", a), u.append("itemid", c.itemid);
                for (var _ = 0; _ < f.length; _++)
                    if ("upload" === c.repositories[f[_]].type) {
                        u.append("repo_id", c.repositories[f[_]].id);
                        break
                    } return u.append("env", c.env), u.append("sesskey", M.cfg.sesskey), u.append("client_id", c.client_id), u.append("savepath", d), u.append("ctx_id", c.context.id), g = (new Date).getTime(), p = "moodleimage_" + Math.round(1e5 * Math.random()) + "-" + g, i.getDialogue({
                    focusAfterHide: null
                }).hide(), o.focus(), o.restoreSelection(), m = r({
                    url: M.util.image_url("i/loading_small", "moodle"),
                    alt: M.util.get_string("uploading", "atto_circuit"),
                    id: p
                }), o.insertContentAtFocusPoint(m), i.markUpdated(), h.onreadystatechange = function () {
                    var e, o, n, s, a = i.editor.one("#" + p);
                    if (4 === h.readyState)
                        if (200 === h.status) {
                            if (e = JSON.parse(h.responseText)) {
                                if (e.error) return a && a.remove(!0), new M.core.ajaxException(e);
                                o = e, e.event && "fileexists" === e.event && (o = e.newfile), n = r({
                                    url: o.url,
                                    presentation: !0
                                }), s = t.Node.create(n), a ? a.replace(s) : i.editor.appendChild(s), i.markUpdated()
                            }
                        } else t.use("moodle-core-notification-alert", function () {
                            new M.core.alert({
                                message: M.util.get_string("servererror", "moodle")
                            })
                        }), a && a.remove(!0);
                    return !0
                }, h.open("POST", M.cfg.wwwroot + "/repository/repository_ajax.php?action=upload", !0), h.send(u), !0
            }
            return !0
        },
        _getSelectedImageProperties: function () {
            var t, e, o = {
                    src: null,
                    alt: null,
                    width: null,
                    height: null
                },
                n = this.get("host").getSelectedNodes();
            return n && (n = n.filter("img")), n && n.size() ? (this._selectedImage = n.item(0), (t = this._selectedImage.getAttribute("width")).match(i.ISPERCENT) || (t = parseInt(t, 10)), (e = this._selectedImage.getAttribute("height")).match(i.ISPERCENT) || (e = parseInt(e, 10)), 0 !== t && (o.width = t), 0 !== e && (o.height = e), o.src = this._selectedImage.getAttribute("src"), o.alt = this._selectedImage.getAttribute("alt") || "", o) : (this._selectedImage = null, !1)
        },
        _displayDialogue: function (t, e) {
            var i, r;
            r = this.getDialogue({
                headerContent: M.util.get_string("circuittitle", "atto_circuit"),
                width: "950",
                height: "700",
                focusAfterHide: e
            }), t.preventDefault(), r.after("visibleChange", function () {
                !1 === r.getAttrs().visible && setTimeout(function () {
                    r.reset()
                }, 5)
            }), "950px" !== r.width && r.set("width", "950px"), "700px" !== r.height && r.set("height", "700px"), i = this._getFormContent(e), r.set("bodyContent", i), document.getElementById(n).src = o, r.centerDialogue(), r.show(), this.markUpdated()
        },
        _getFormContent: function (e) {
            var i = t.Handlebars.compile('<iframe src="{{isource}}" id="{{iframeID}}" style="{{CSS.HGT}}{{CSS.WDT}}" scrolling="auto" frameborder="0"></iframe><div style="text-align:center"><button class="mdl-align {{CSS.INPUTSUBMIT}}" id="{{submitid}}" style="{{selectalign}}">{{get_string "insert" component}}</button></div>'),
                s = t.Node.create(i({
                    elementid: this.get("host").get("elementid"),
                    CSS: r,
                    component: "atto_circuit",
                    clickedicon: e,
                    isource: o,
                    iframeID: n,
                    submitid: "submit"
                }));
            return this._form = s, this.get("storeinrepo") > 0 ? (this._form.one("." + r.INPUTSUBMIT).on("click", this._doInsert, this), console.log("doinsert")) : this._form.one("." + r.INPUTSUBMIT).on("click", this._doInsertBase64, this), s
        },
        _doInsertBase64: function (t) {
            t.preventDefault();
            var e = document.getElementById(n).contentWindow.document.getElementById("canvas");
            imgstring = e.toDataURL(), circuit = '<img src="' + imgstring + '" />', this.getDialogue({
                focusAfterHide: null
            }).hide(), this.editor.focus(), this.get("host").insertContentAtFocusPoint(circuit), this.markUpdated()
        }
    }, {
        ATTRS: {
            storeinrepo: {
                value: 0
            }
        }
    })
}, "@VERSION@", {
    requires: ["moodle-editor_atto-plugin"]
});