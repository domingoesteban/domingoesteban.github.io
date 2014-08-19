/*
Custom JS
==========

Author: Domingo Esteban
Updated: August 2014

*/

/*
$(function() {

  $('#alertMe').click(function(e) {

    e.preventDefault();

    $('#successAlert').slideDown();

  });
}); */


$('.dropdown-toggle').dropdown();


$('.mytooltip').tooltip();


$('[rel="popover"]').popover({
  trigger: 'hover', // click | hover | focus | manual
  html: true,
  delay: 500,
});



// $('.navbar li').click(function(e) {
//     $('.navbar li.active').removeClass('active');
//     var $this = $(this);
//     if (!$this.hasClass('active')) {
//         $this.addClass('active');
//     }
//     e.preventDefault();
// });
