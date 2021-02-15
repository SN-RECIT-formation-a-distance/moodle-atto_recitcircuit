	////////////////////////////////////////////////////////////////////////////////
	//
	//  mesure
	//
	////////////////////////////////////////////////////////////////////////////////
	export var mesurerecit () {
		
		Mesure_types = ['amperemetre','voltmetre', 'ohmmetre'];
  
		function mesure(x,y,rotation,name,vm,type) {
		Component.call(this,'vm',x,y,rotation);
		this.properties.name = name;
		//this.properties.r = r ? r : '1';
		this.add_connection(0,-24);
		this.add_connection(0,24);
		this.properties.type = type ? type : 'amperemetre';
		this.bounding_box = [-12,-24,12,24];
		this.update_coords();
	}
	mesure.prototype = new Component();
	mesure.prototype.constructor = mesure;

	mesure.prototype.toString = function() {
		return '<mesure '+this.properties.vm+' ('+this.x+','+this.y+')>';
	};

	mesure.prototype.draw = function(c) {
		Component.prototype.draw.call(this,c); 
		
		  // give superclass a shot
		this.draw_line(c,0,-24,0,-12);
	    this.draw_circle(c,0,0,12,false);
		this.draw_line(c,0,12,0,24);
		if (this.properties.type == 'voltmetre') {
			// put a box around an ideal diode
			this.draw_text(c,"V",0,0,4,14, false);
		}
		else if (this.properties.type == 'amperemetre'){
			this.draw_text(c,"A",0,0,4,14, false);
		}
		else if (this.properties.type == 'ohmmetre'){
			this.draw_text(c,"\u03A9",0,0,4,14, false);
		}
			else{
				this.draw_text(c,"\u03A9",0,0,4,14, false);
			}
	   
	   
	    if (this.properties.name)
	    	this.draw_text(c,this.properties.name,30,0,5,property_size);
	};
	mesure.prototype.edit_properties = function(x,y) {
		if (inside(this.bbox,x,y)) {
			var fields = [];
			fields.name = build_input('text',10,this.properties.name);
						fields.type = build_select(Mesure_types,this.properties.type);

			var content = build_table(fields);
			content.fields = fields;
			content.component = this;

			this.sch.dialog(window.parent.M.str.atto_circuit.Edit_Properties,content,function(content) {
				content.component.properties.name = content.fields.name.value;
				content.component.properties.type = Mesure_types[content.fields.type.selectedIndex];
				content.component.sch.redraw_background();
			});
			return true;
		} else return false;
	};
	mesure.prototype.clone = function(x,y) {
		return new mesure(x,y,this.rotation,this.properties.name,this.properties.vm);
	};
	}